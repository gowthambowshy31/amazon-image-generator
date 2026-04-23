# @bowshai/imagegen

CLI for bulk AI image & video variation generation via the ImageGen platform.

## Install

```bash
npm i -g @bowshai/imagegen
```

Requires Node.js 18+.

## Quick start

```bash
# 1. Create a key at https://imagegen.bowshai.com/settings/api-keys
# 2. Log in
imagegen login igp_your_key_here

# 3. Point at a folder, get 3 variations of each image
imagegen generate ./my-images --prompt "studio product photography, soft lighting" --variants 3

# 4. Use a saved template instead of a freeform prompt
imagegen templates
imagegen generate ./my-images --template <id> --var material=gold --variants 2
```

## Commands

| Command | Description |
| --- | --- |
| `imagegen login <apiKey>` | Store API key locally (`--api-url` to override host). |
| `imagegen logout` | Remove stored key. |
| `imagegen whoami` | Show the logged-in account. |
| `imagegen generate <input>` | Generate N variations for a file or folder of images. |
| `imagegen video <prompt>` | Generate a single video from a prompt. |
| `imagegen templates` | List prompt templates available to your account. |
| `imagegen config show` | Show current config (file path, API URL, key prefix). |
| `imagegen config set-api-url <url>` | Point at a different API host. |

### `generate` flags

```
-p, --prompt <text>         Prompt describing the desired variation
-t, --template <id>         Template ID (overrides --prompt)
    --var key=value         Template variable (repeatable)
-n, --variants <count>      Variants per image (1–10, default 3)
-o, --out <dir>             Output directory (default ./imagegen-output)
-c, --concurrency <n>       Parallel requests (1–8, default 2)
    --batch <id>            Custom batch ID
    --model <name>          Override the image model
    --no-download           Print URLs only; don't download
```

## Environment overrides

Both env vars and config file are supported; env takes precedence.

```
IMAGEGEN_API_URL=https://imagegen.bowshai.com
IMAGEGEN_API_KEY=igp_...
IMAGEGEN_CONFIG_DIR=/custom/config/dir
```

## How it works

Each image in the input folder is POSTed to `/api/cli/generate` with your
prompt/template. The API calls Gemini for each variant in parallel, uploads
each result to S3, and returns public URLs. The CLI downloads them into
`--out`, named `<original-stem>_v<N>.<ext>`.

No images are persisted to your account's database — these are scratch
generations for bulk workflows.
