# Bowshai Seller Platform — Project notes

This repo (originally `amazon-image-generator`) was consolidated **2026-04-26** to absorb three sister Amazon-seller apps into a single multi-tenant Next.js application:

- `amazon-image-generator` (base) → Studio module
- `amazon-business-analytics` → Profit module (raw SQL → Prisma)
- `amazon-ebay-mcf-sync` → Channels module (T3/tRPC → REST)
- `amazon-review-requester` → Reviews module (node-cron → HTTP cron)

All four modules share `Organization`, `User`, `AmazonConnection`, `Job`, `SyncLog` — see `prisma/schema.prisma` for the unified schema.

# Git Workflow

- Work directly on `main` — no feature branches for routine work.
- After each change, **commit and push immediately** without asking.
- Use short, descriptive commit messages (what was done, not how).

# Module structure

```
app/
  dashboard/              # Studio dashboard (existing)
  products/, bulk-*/, ... # Studio (image / video gen)
  profit/                 # Profit module
    advertising/, reports/, inventory/, reimbursements/, purchase-orders/
  channels/               # Channels (Amazon → eBay MCF) module
    inventory/, orders/, migration/, settings/
  reviews/                # Reviews module
    orders/, solicitations/, settings/
  api/
    profit/, channels/, reviews/   # module REST endpoints
    cron/                          # HTTP cron entry points (one per module)

lib/
  amazon-sp.ts            # Studio's existing SP-API service (catalog + listings push)
  encryption.ts           # encrypt/decrypt for stored credentials
  reviews/                # Reviews services (sp-client, rate-limiter, orders, solicitations, refunds)
  channels/               # Channels services (ebay-client, ebay-auth, amazon-sp, inventory-sync, order-routing)
  profit/                 # Profit services (ads-client, ads-sync, sp-inventory, excel)
```

# Cron endpoints (require `?secret=$CRON_SECRET` or `x-cron-secret` header)

| Endpoint | Suggested schedule | Purpose |
|---|---|---|
| `/api/cron/reviews` | daily 14:00 UTC (~6am PT) | Sync orders → check refunds → refresh eligibility → send batch solicitations |
| `/api/cron/channels` | every 30 min | Amazon→DB inventory sync → push to mapped eBay listings → poll eBay orders → submit MCF → track shipments |
| `/api/cron/profit` | daily 06:00 UTC | Sync Amazon Ads daily report → upsert ad performance + campaigns; refresh live FBA inventory |
| `/api/cron/drain` | every 30 min | Studio quota-exhausted regeneration drain (existing) |

# EC2 Deployment (consolidated infra — 4 apps on one box)

- **Instance:** `i-0bb31ec99e9cda509` (t3.medium, eu-north-1)
- **IP:** `13.50.90.196` (Elastic IP)
- **User:** `ubuntu`
- **SSH Key:** `C:\work\Project-kit\image-gen-key.pem`
- **Project path:** `/home/ubuntu/amazon-image-generator`
- **Port:** `3003`
- **PM2 app name:** `amazon-image-generator`
- **Domain:** `imagegen.bowshai.com` via nginx reverse proxy → `localhost:3003`
- **SSL:** SAN cert under `/etc/letsencrypt/live/sellerpulse.bowshai.com/`
- **Database:** RDS `profitability-excel-db`, database name `imagegenplatform`

## Deploy steps

```bash
git push origin main
ssh -i /c/work/Project-kit/image-gen-key.pem ubuntu@13.50.90.196 \
  "cd /home/ubuntu/amazon-image-generator && git pull origin main && npm install && npx prisma generate && npx prisma db push --accept-data-loss=false && npm run build && pm2 restart amazon-image-generator"
```

`npm run build` runs `prisma generate && prisma db push && next build`, so the manual `prisma db push` above is belt-and-braces — safe to remove if you trust the npm script.

## Update .env on EC2

```bash
ssh -i /c/work/Project-kit/image-gen-key.pem ubuntu@13.50.90.196
nano /home/ubuntu/amazon-image-generator/.env
pm2 restart amazon-image-generator
```

# Per-org credentials

- **AmazonConnection** (existing): SP-API per Organization. `clientId`/`clientSecret` and `refreshToken` are encrypted via `lib/encryption.ts`.
- **AmazonAdsConnection** (new): Ads API v3 per Organization, separate refresh token.
- **EbayConnection** (new): eBay app credentials + per-user OAuth refresh token. Configure app credentials at `/channels/settings`, then click "Connect eBay account" to start the OAuth flow at `/api/channels/ebay/authorize`.

Env-var fallbacks exist for SP-API and Ads API so a single-org dev setup works without DB rows.

# CLI & MCP server

- **`cli/`** — `@bowshai/imagegen` npm package. Commands: `login`, `whoami`, `generate`, `video`, `templates`, `config`.
- **`mcp/`** — `@bowshai/imagegen-mcp` MCP server. Tools: `generate_variations`, `generate_video`, `list_templates`, `whoami`.

Both authenticate via API keys (`igp_...`) generated at `/settings/api-keys`.
