# Git Workflow

- Work directly on `main` — no feature branches for routine work.
- After each change, **commit and push immediately** without asking.
- Use short, descriptive commit messages (what was done, not how).

# EC2 Deployment (consolidated infra — 4 apps on one box)

- **Instance:** `i-0bb31ec99e9cda509` (t3.medium, eu-north-1)
- **IP:** `13.50.90.196` (Elastic IP)
- **User:** `ubuntu`
- **SSH Key:** `C:\work\Project-kit\image-gen-key.pem`
- **Project path:** `/home/ubuntu/amazon-image-generator`
- **Port:** `3003`
- **PM2 app name:** `amazon-image-generator`
- **Domain:** `imagegen.bowshai.com` via nginx reverse proxy → `localhost:3003`
- **SSL:** SAN cert shared across all 4 bowshai apps, stored under `/etc/letsencrypt/live/sellerpulse.bowshai.com/` (covers `sellerpulse`, `reviewpulse`, `syncflow`, `imagegen`)
- **Database:** RDS `profitability-excel-db`, database name `imagegenplatform`

## Deploy steps

1. Commit and push to `origin/main`
2. SSH in and redeploy:

```bash
ssh -i /c/work/Project-kit/image-gen-key.pem ubuntu@13.50.90.196 \
  "cd /home/ubuntu/amazon-image-generator && git pull origin main && npm install && npm run build && pm2 restart amazon-image-generator"
```

## Update .env on EC2

```bash
ssh -i /c/work/Project-kit/image-gen-key.pem ubuntu@13.50.90.196
nano /home/ubuntu/amazon-image-generator/.env
pm2 restart amazon-image-generator
```

## Notes

- The old pre-consolidation IP `56.228.4.202` is decommissioned — do not use.
- The consolidated server may be stopped to save costs. Use the `/server` skill to start it before deploying.

# CLI & MCP server

This repo also contains two publishable packages for programmatic access:

- **`cli/`** — `@bowshai/imagegen` npm package. Commands: `login`, `whoami`, `generate`, `video`, `templates`, `config`. Build with `cd cli && npm run build`.
- **`mcp/`** — `@bowshai/imagegen-mcp` MCP server for Claude Desktop / Claude Code. Tools: `generate_variations`, `generate_video`, `list_templates`, `whoami`. Build with `cd mcp && npm run build`.

Both authenticate via API keys (`igp_...`) generated at `/settings/api-keys` in the web app. Keys are hashed (SHA-256) and stored on the `ApiKey` Prisma model; all CLI traffic flows through `/api/cli/*` endpoints using `Authorization: Bearer <key>`.
