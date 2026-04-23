# ImageGen Platform — LLM Reference

> This document is written for a Large Language Model to consume. It describes the full architecture, APIs, data model, and usage patterns of the ImageGen platform so that an assistant LLM can answer questions about it and help users operate the CLI, MCP server, and HTTP API correctly.

---

## 1. Executive summary

**Product:** ImageGen is a web application and set of client libraries that perform AI-powered bulk image and video generation for e-commerce product photography (primarily Amazon listings). It wraps Google's Gemini 3 Pro Image model and Veo 3.1 video model behind a stable HTTP API with authentication, storage, and batch semantics.

**Primary use case:** A user points a client at a local folder of source product images and requests *N* AI-generated variations per image (e.g. "studio lighting, white background, Amazon listing style"). The platform returns uploaded S3 URLs for each variant; the client downloads them locally.

**Three client surfaces — all thin wrappers around the same HTTP API:**
| Client | Audience | Entry point |
|---|---|---|
| Web app (Next.js) | Humans via browser | `https://imagegen.bowshai.com` |
| CLI | Developers on terminals | `npm i -g @bowshai/imagegen` |
| MCP server | LLMs (Claude Desktop / Code / any MCP client) | `npm i -g @bowshai/imagegen-mcp` |

---

## 2. Architecture

```
┌───────────────────────┐        ┌───────────────────────┐
│ USER'S MACHINE        │        │ HOSTED INFRASTRUCTURE │
│                       │        │                       │
│  Browser / CLI / MCP  │──HTTPS─▶│ Next.js app (EC2)    │──▶ Gemini API
│  (one of three)       │ Bearer │ imagegen.bowshai.com  │──▶ S3 (images out)
│                       │        │                       │──▶ RDS Postgres
└───────────────────────┘        └───────────────────────┘
```

- **EC2:** `i-0bb31ec99e9cda509`, `13.50.90.196` (Elastic IP), region `eu-north-1`, instance `t3.medium`
- **Process manager:** PM2 app name `amazon-image-generator` on port `3003`
- **Reverse proxy:** nginx → `localhost:3003`, SSL via Let's Encrypt SAN cert at `/etc/letsencrypt/live/sellerpulse.bowshai.com/`
- **Domain:** `imagegen.bowshai.com`
- **Database:** RDS `profitability-excel-db`, database `imagegenplatform`
- **Object storage:** S3 bucket `image-gen-platform-uploads`, region `eu-north-1`, key prefix `client-batches/{batchId}/` and `cli-videos/`
- **AI models:**
  - Images: `gemini-3-pro-image-preview` via `generativelanguage.googleapis.com`
  - Video: `veo-3.1-generate-preview` (long-running operation pattern)

---

## 3. Authentication

Two independent mechanisms coexist:

### 3.1 Session cookie (for web UI)
- NextAuth with Credentials provider (email + bcrypt password)
- Cookie name: `image-gen-platform.session-token`
- Used by all `/app/*` pages and most `/api/*` routes
- Middleware (`middleware.ts`) enforces redirect to `/login` for missing cookies, with `publicRoutes = ["/login", "/register", "/api/auth", "/gallery", "/api/batch", "/api/cli"]`

### 3.2 API Key (for CLI / MCP / programmatic)
- Format: `igp_<43 url-safe-base64 chars>` → total length ~47 chars starting with `igp_`
- Transmitted as `Authorization: Bearer igp_...`
- Storage: plaintext is never persisted. On creation, `sha256(plaintext)` is stored in `ApiKey.keyHash` (unique indexed). First 12 chars saved as `ApiKey.keyPrefix` for UI display.
- Lifecycle: create via UI or `POST /api/keys` (session-authed); revoke by setting `revokedAt` via `DELETE /api/keys/[id]`.
- Lookup: incoming bearer → compute sha256 → find by `keyHash`. If `revokedAt != null`, reject.
- `lastUsedAt` updated fire-and-forget on each successful authentication.

**Helper function:** `lib/api-key-auth.ts::authenticateApiKey(request)` returns `{ user: AuthUser }` on success or `{ error: NextResponse(401) }` on failure. All `/api/cli/*` routes use this.

---

## 4. Data model (Prisma)

Relevant models for CLI/MCP operation:

### 4.1 `User`
Owns API keys and generated content.
```
id, email (unique), name, password (bcrypt), role, organizationId, createdAt, updatedAt
role: ADMIN | EDITOR | CLIENT | VIEWER
```

### 4.2 `ApiKey`
```
id, userId → User, name, keyHash (unique, sha256 of plaintext),
keyPrefix (first 12 chars for UI), lastUsedAt, revokedAt, createdAt
```
A user may have many keys. Revocation is soft (sets `revokedAt`). Cascade-deletes with the user.

### 4.3 `PromptTemplate` + `TemplateVariable`
Parameterized prompts. `promptText` contains `{{variable_name}}` placeholders that are substituted at generation time using values the CLI/MCP passes in.
```
PromptTemplate: id, name (unique), description, promptText, category (image|video|both), isActive, order
TemplateVariable: id, templateId, name, displayName, type (TEXT|DROPDOWN|AUTO), isRequired, defaultValue, options[], order
```
As of the latest deploy there are 24 active templates, mostly jewelry-focused (e.g. "Jewelry - Image 6: Privosa Packaging", "Jewelry - Video 1: 360° Rotation").

### 4.4 Other referenced models (not directly touched by CLI)
- `Product`, `SourceImage`, `GeneratedImage`, `GeneratedVideo` — used by the web UI's batch workflow
- `GenerationJob` — a queue record; has no background worker yet

---

## 5. HTTP API reference — CLI / MCP surface

Base URL: `https://imagegen.bowshai.com`.
All endpoints under `/api/cli/*` require `Authorization: Bearer igp_...`.

### 5.1 `GET /api/cli/whoami`
Verify a key and return account info.
**Response 200:**
```json
{ "id": "clx...", "email": "user@example.com", "name": "...", "role": "ADMIN", "organizationId": null }
```

### 5.2 `GET /api/cli/templates?category=image|video|both|all`
List active prompt templates.
**Response 200:**
```json
{
  "templates": [
    {
      "id": "cm...",
      "name": "Jewelry - Image 6: Privosa Packaging",
      "description": "Product in Privosa branded packaging",
      "promptText": "... {{product_name}} ... {{metal_type}} ...",
      "category": "image",
      "variables": [
        { "name": "product_name", "displayName": "Product Name", "type": "TEXT", "isRequired": true, "defaultValue": null, "options": [] }
      ]
    }
  ]
}
```

### 5.3 `POST /api/cli/generate`
The workhorse. Takes a single source image + a prompt or template, generates N variants in parallel via Gemini, uploads each to S3, returns URLs.

**Accepts two content types:**

**A) `multipart/form-data`** (preferred by CLI/MCP — avoids base64 overhead):
| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | File | yes¹ | Source image. Server infers MIME from `content-type` and falls back to filename extension if the browser/SDK sent `application/octet-stream`. |
| `prompt` | string | yes² | Free-form prompt. Required if `templateId` absent. |
| `templateId` | string | yes² | Prompt template ID. If set, overrides `prompt` after `{{var}}` substitution. |
| `variables` | string | no | JSON object of `{ varName: value }` used to fill `{{var}}` placeholders in the template. |
| `variants` | string | no | Integer 1–10. Defaults to 1. Clamped. |
| `batchId` | string | no | Custom batch identifier. Default: `cli-<ts>-<rand>`. |
| `model` | string | no | Override the image model. |

¹ Source image optional only in pure text-to-image mode (no prior work uses this path).
² Exactly one of `prompt` / `templateId` required.

**B) `application/json`:** Same fields, with `sourceUrl` or `sourceBase64` + `sourceMime` in place of the file upload. Used by the web-app's existing batch flow; CLI/MCP use multipart.

**Response 200:**
```json
{
  "batchId": "cli-1776948330831-m87juz",
  "source": "IMG_3863.JPG",
  "prompt": "Professional studio product photography ...",
  "variants": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    { "variantIndex": 1, "url": "https://image-gen-platform-uploads.s3.eu-north-1.amazonaws.com/client-batches/cli-.../IMG_3863_v1_r....jpg", "key": "client-batches/.../...", "size": 330936, "mime": "image/jpeg" },
    { "variantIndex": 2, "url": "...", ... },
    { "variantIndex": 3, "error": "Gemini 400: ..." }
  ]
}
```

**Error modes:**
- `401` — missing/invalid/revoked Bearer key
- `404` — `templateId` not found
- `400` — neither `prompt` nor `templateId` provided
- `500` — upstream Gemini error (propagated verbatim in the failed `results[i].error`)
- `502` — nginx gateway timeout (transient; safe to retry per-image)

### 5.4 `POST /api/cli/video`
Start a long-running video generation. Returns an operation handle to poll.
**Request body (JSON):**
```json
{ "prompt": "...", "aspectRatio": "16:9", "durationSeconds": 4, "resolution": "720p" }
```
**Response 200:** `{ "operationName": "operations/...", "status": "pending" }`

### 5.5 `POST /api/cli/video/status`
Poll a running video operation.
**Request body:** `{ "operationName": "operations/..." }`
**Response when still running:** `{ "done": false, "operationName": "..." }`
**Response when done:** `{ "done": true, "url": "https://...s3.../cli-videos/...mp4", "key": "...", "size": 5432100 }`
**Response on failure:** `{ "done": true, "error": "...", "raw": {...} }`

Polling cadence convention: start at 10s intervals, back off to max 30s, fail after ~10 minutes.

---

## 6. HTTP API reference — Session-authed endpoints for key management

These are used by the web UI `/settings/api-keys` page, not by the CLI itself.

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| GET | `/api/keys` | session | List current user's keys (redacted) | `{ keys: [{ id, name, keyPrefix, createdAt, lastUsedAt, revokedAt }] }` |
| POST | `/api/keys` | session | Create new key | `{ id, name, keyPrefix, createdAt, key: "igp_...", warning }` — **full plaintext returned once** |
| DELETE | `/api/keys/:id` | session | Revoke a key | `{ revoked: true }` |

---

## 7. Existing web-app endpoints (for reference, usable via session auth)

These are not part of the CLI surface but an LLM answering questions about the platform should know they exist:

- `POST /api/batch/regenerate` — synchronous single-image regeneration (public, no auth; takes `sourceUrl`, returns S3 URL). This is the older web-flow equivalent of `/api/cli/generate` with `variants=1`.
- `POST /api/generate-image` — text-to-image, no source (session-authed, saves to `public/uploads`).
- `POST /api/generate-video` / `POST /api/check-video-status` — session-authed equivalents of the CLI video endpoints.
- `GET /api/templates`, `GET /api/image-types`, `GET /api/jobs`, `GET /api/jobs/:id` — web UI data sources.
- `POST /api/upload` — local file upload to `public/uploads/` (for in-app use, not CLI).
- `POST /api/images/bulk-generate` — queues a `GenerationJob` row; there is currently no background worker that processes these.

---

## 8. CLI reference (`@bowshai/imagegen`)

Binary: `imagegen`. Config file: `~/.config/imagegen/config.json` (Linux/Mac), `%APPDATA%\imagegen\config.json` (Windows). `IMAGEGEN_API_KEY` and `IMAGEGEN_API_URL` env vars override file values.

| Command | Description | Key flags |
|---|---|---|
| `imagegen login <apiKey>` | Store an API key, verify via whoami | `--api-url <url>` |
| `imagegen logout` | Remove stored key | — |
| `imagegen whoami` | Show logged-in account | — |
| `imagegen generate <input>` | Generate N variants per image in a folder or file | `-p --prompt`, `-t --template <id>`, `--var k=v`, `-n --variants <1-10>`, `-o --out <dir>`, `-c --concurrency <1-8>`, `--batch <id>`, `--model <name>`, `--no-download` |
| `imagegen video <prompt>` | Generate a single video | `--aspect`, `--duration`, `--resolution`, `-o --out`, `--poll-interval`, `--timeout` |
| `imagegen templates` | List templates | `--category image\|video\|both`, `--json` |
| `imagegen config show` | Print config | — |
| `imagegen config set-api-url <url>` | Change API base URL | — |

Output naming convention: `<original-stem>_v<N>.<ext>` in `--out`. Default output dir: `./imagegen-output`.

**Internal flow of `generate`:**
1. Collect image files from `input` (accepts file or folder; filters by extension — jpg/png/webp/gif/bmp/tiff)
2. Run workers with concurrency limit; each worker per file:
   - Read bytes
   - POST multipart to `/api/cli/generate` with filename, prompt, variants
   - For each successful result in `results[]`, download URL to `<outDir>/<stem>_v<i>.<ext>`
3. Print progress line per variant; summary at end.

---

## 9. MCP server reference (`@bowshai/imagegen-mcp`)

**Transport:** stdio (JSON-RPC 2.0 per MCP protocol `2024-11-05`).
**Launch:** `npx -y @bowshai/imagegen-mcp`.
**Required environment variables:** `IMAGEGEN_API_KEY`. Optional: `IMAGEGEN_API_URL` (defaults to `https://imagegen.bowshai.com`).

**Exposed tools:**

### 9.1 `generate_variations`
Take a folder or single image, generate N variations per image, download to a local folder.
```jsonc
// inputSchema
{
  "inputPath":   { "type": "string", "required": true,  "desc": "Absolute path to an image file OR folder containing images." },
  "prompt":      { "type": "string", "required": "one_of[prompt,templateId]" },
  "templateId":  { "type": "string", "required": "one_of[prompt,templateId]" },
  "variables":   { "type": "object", "additionalProperties": "string" },
  "variants":    { "type": "integer", "min": 1, "max": 10, "default": 3 },
  "outputPath":  { "type": "string", "desc": "Absolute path to save generated files. Defaults to <inputPath>/imagegen-output." },
  "batchId":     { "type": "string" }
}
```
Returns a text block summarizing successes/failures and the output directory.

### 9.2 `generate_video`
```jsonc
{
  "prompt":              { "type": "string", "required": true },
  "aspectRatio":         { "type": "string", "default": "16:9" },
  "durationSeconds":     { "type": "integer", "default": 4, "min": 2, "max": 8 },
  "resolution":          { "type": "string", "default": "720p" },
  "outputPath":          { "type": "string", "desc": "If set, save the mp4 here." },
  "pollIntervalSeconds": { "type": "integer", "default": 10 },
  "timeoutSeconds":      { "type": "integer", "default": 600 }
}
```

### 9.3 `list_templates`
`{ "category": "image|video|both" }` — returns formatted text list with IDs for use in `generate_variations`.

### 9.4 `whoami`
No input; returns `"Connected as <email> (role: <role>). API: <url>"`.

---

## 10. Canonical workflow — "bulk variation of a folder"

This is the primary intended use case. An LLM answering product-support questions should recognize and route to this.

**User intent:** "I have a folder of product photos. Generate N AI variations per image and give them back to me."

**Preferred surface:**
- If user is in Claude Desktop / Code: call `generate_variations` MCP tool.
- If user is on terminal: `imagegen generate <folder> --prompt "<prompt>" --variants N`.
- If user is on the web: use the Batch UI (separate flow, not covered here).

**Preflight checks an LLM should perform before calling a tool:**
1. Does the folder exist and contain readable images? Reject `.mp4`, `.pdf`, etc.
2. Is an API key configured? If MCP: check `IMAGEGEN_API_KEY` is set in env. If CLI: check `imagegen whoami` succeeds.
3. Is the prompt specific enough? If user gave a vague intent ("make them nicer"), ask for clarification before spending generation credits.
4. Is `variants` reasonable? >3 uses a lot of Gemini calls; confirm if user explicitly wants >5.

**Expected per-image cost & time:** ~7–15 seconds per variant for images, ~60–120 seconds for a 4-second video. Each variant is a separate Gemini call; failures are per-variant, not per-batch.

---

## 11. Error handling contract

| Source | HTTP | Client action |
|---|---|---|
| Missing/invalid Bearer | 401 | Ask user to re-login. Do not retry. |
| Revoked key | 401 | Same as above. |
| Invalid body (missing prompt/templateId) | 400 | Surface the error; do not retry. |
| Template not found | 404 | Ask user to pick from `list_templates`. |
| Gemini "Unsupported MIME type: application/octet-stream" | 400 (inside `results[i].error`) | Fixed in v0.1.0+; should not reoccur. If it does, upgrade CLI/MCP. |
| Gemini rate limit / 5xx | 500 / 502 | Transient. Safe to retry per-image with exponential backoff. |
| nginx 502 | 502 | Transient upstream timeout. Retry the same image. |
| S3 upload failure | 500 | Check server logs; usually transient. |

**Idempotency:** `batchId` makes retries idempotent at the batch level only. If a single variant fails and you retry the whole request, you will get new S3 keys for the successes too. For proper retry, re-call per-image.

---

## 12. Deployment & operations

**Deploy command (from a local dev machine):**
```bash
ssh -i /c/work/Project-kit/image-gen-key.pem ubuntu@13.50.90.196 \
  "cd /home/ubuntu/amazon-image-generator && git pull origin main && npm install && npm run build && pm2 restart amazon-image-generator"
```

**Build pipeline:** `prisma generate && prisma db push && next build`. The `cli/` and `mcp/` folders are excluded from the Next tsconfig (they have their own tsconfigs).

**Log access:** `ssh ... "pm2 logs amazon-image-generator --lines 100"`.

**Infra start/stop:** EC2 may be stopped to save costs. `aws ec2 start-instances --instance-ids i-0bb31ec99e9cda509 --region eu-north-1` followed by `aws rds start-db-instance --db-instance-identifier profitability-excel-db --region eu-north-1`. RDS takes 2–5 min to become `available`.

---

## 13. File locations in the repository

Root: `C:\work\code\amazon-image-generator` (git repo, main branch).

| Path | Purpose |
|---|---|
| `prisma/schema.prisma` | Data model. `ApiKey` is the CLI-relevant addition. |
| `middleware.ts` | Auth routing; `/api/cli` is a public prefix (auth handled per-route). |
| `lib/api-key-auth.ts` | Bearer token auth logic (`generateApiKey`, `hashApiKey`, `authenticateApiKey`). |
| `lib/gemini-generate.ts` | Shared Gemini image call helper. |
| `app/api/keys/route.ts`, `app/api/keys/[id]/route.ts` | Key CRUD (session auth). |
| `app/api/cli/whoami/route.ts` | Echo auth info. |
| `app/api/cli/templates/route.ts` | List active templates. |
| `app/api/cli/generate/route.ts` | Core variant generation. |
| `app/api/cli/video/route.ts`, `.../video/status/route.ts` | Video generation + polling. |
| `app/settings/api-keys/page.tsx` | Key management UI. |
| `cli/` | `@bowshai/imagegen` npm package source. |
| `mcp/` | `@bowshai/imagegen-mcp` npm package source. |
| `CLAUDE.md` | Repo-level developer notes (deploy, infra). |

---

## 14. Known limitations / not-implemented

- No bulk template application: CLI's `--template <id>` uses one template for all images in the folder. Per-image template selection would require a manifest file (not yet supported).
- No resume: if a batch partially fails, re-running regenerates everything.
- No webhooks: all job completion is polling-based.
- No `GenerationJob` worker: the DB queue model exists but is not processed. `/api/images/bulk-generate` creates queue rows that never run.
- No rate limiting on `/api/cli/*`: keys are authenticated but not throttled.
- Image model hardcoded in `lib/gemini-generate.ts` unless `model` is passed; the `model` override is advertised but not widely tested against alternatives.

---

## 15. Quick-answer cheat sheet for an LLM

- "How do I get a key?" → Log into `https://imagegen.bowshai.com/settings/api-keys`, click Create, copy the shown `igp_...` string. It's shown once.
- "How do I log in with the CLI?" → `imagegen login igp_...`.
- "How do I install the CLI?" → `npm i -g @bowshai/imagegen` (requires Node ≥18).
- "How do I use MCP with Claude Desktop?" → Add `"imagegen": { "command": "npx", "args": ["-y", "@bowshai/imagegen-mcp"], "env": { "IMAGEGEN_API_KEY": "igp_..." } }` under `mcpServers` in `claude_desktop_config.json`; restart Claude Desktop.
- "How long does a 100-image job take?" → `100 × variants × ~10s / concurrency`. With default concurrency 2 and 3 variants, ~25 minutes.
- "Where do generated images live?" → S3 public URLs returned in the response. They persist; no TTL. Local copies saved to `--out` dir by the CLI.
