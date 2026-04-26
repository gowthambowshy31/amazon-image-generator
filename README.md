# Bowshai Seller Platform

All-in-one Amazon seller suite. Combines four previously-separate apps into a single multi-tenant Next.js application:

| Module | What it does |
|---|---|
| **Studio** | AI-powered product image and video generation (Gemini 2.5 Flash Image + Veo 3.1 + Seedance 2.0) |
| **Profit** | Profitability analytics, advertising performance, FBA inventory, reimbursements, purchase orders |
| **Channels** | Amazon → eBay MCF (Multi-Channel Fulfillment) inventory sync + order routing |
| **Reviews** | Automated Amazon Request-a-Review solicitations with eligibility checks |

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Prisma 7 + PostgreSQL (RDS)
- NextAuth v5 (Credentials + Google OAuth + Resend magic link)
- Tailwind CSS 3 + shadcn/ui (Radix primitives)
- Zustand for state, p-queue for SP-API rate limiting
- Companion CLI (`@bowshai/imagegen`) and MCP server (`@bowshai/imagegen-mcp`) under `cli/` and `mcp/`

## Environment

Required:

```
DATABASE_URL=postgres://...
NEXTAUTH_URL=https://imagegen.bowshai.com
NEXTAUTH_SECRET=...
AUTH_SECRET=...
ENCRYPTION_KEY=...
CRON_SECRET=...
```

Studio module:
```
GEMINI_API_KEY=...
GEMINI_IMAGE_DAILY_LIMIT=250
SEEDANCE_API_KEY=...
ARK_API_KEY=...
ARK_BASE_URL=...
AWS_REGION=eu-north-1
AWS_S3_BUCKET_NAME=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Amazon SP-API (used by Studio, Profit, Channels, Reviews — credentials are **also** stored per-org in `AmazonConnection`; env values are fallback):
```
AMAZON_CLIENT_ID=...
AMAZON_CLIENT_SECRET=...
AMAZON_REFRESH_TOKEN=...
AMAZON_REGION=na
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
AMAZON_SELLER_ID=...
```

Amazon Ads API (Profit module):
```
AMAZON_ADS_CLIENT_ID=...
AMAZON_ADS_CLIENT_SECRET=...
AMAZON_ADS_REFRESH_TOKEN=...
AMAZON_ADS_PROFILE_ID=...
```

Auth providers (optional):
```
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=noreply@bowshai.com
REQUIRE_INVITE_CODE=1
```

## Modules

### Studio (existing)
- `/dashboard`, `/products`, `/bulk-generate`, `/bulk-push`, `/templates`, `/prompt-generator`
- API: `/api/products`, `/api/generate-image`, `/api/generate-video`, `/api/batch`, `/api/cli/*`
- CLI + MCP server (`cli/`, `mcp/`)

### Profit (new — lifted from amazon-business-analytics)
- `/profit`, `/profit/advertising`, `/profit/reports`, `/profit/inventory`, `/profit/reimbursements`, `/profit/purchase-orders`
- API: `/api/profit/*`, cron at `/api/cron/profit`
- Lib: `lib/profit/{ads-client,ads-sync,sp-inventory,excel}.ts`

### Channels (new — lifted from amazon-ebay-mcf-sync)
- `/channels/inventory`, `/channels/orders`, `/channels/migration`, `/channels/settings`
- API: `/api/channels/*`, cron at `/api/cron/channels`
- eBay OAuth: `/api/channels/ebay/{authorize,callback}` redirects user to/from eBay
- Lib: `lib/channels/{ebay-client,ebay-auth,ebay-inventory,amazon-sp,inventory-sync,order-routing}.ts`

### Reviews (new — lifted from amazon-review-requester)
- `/reviews/orders`, `/reviews/solicitations`, `/reviews/settings`
- API: `/api/reviews/*`, cron at `/api/cron/reviews`
- Lib: `lib/reviews/{sp-client,orders.service,solicitations.service,refunds.service}.ts`

## Cron schedule (suggested)

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `GET /api/cron/reviews?secret=...` | Daily at 14:00 | Sync orders, refunds, eligibility, send batch (~6am PT) |
| `GET /api/cron/channels?secret=...` | Every 30 min | Inventory sync, eBay order poll, MCF tracking refresh |
| `GET /api/cron/profit?secret=...` | Daily at 06:00 | Ads daily report, SP-API inventory refresh |
| `GET /api/cron/drain?secret=...` | Every 30 min | Studio quota-exhausted regeneration drain |

Configure with PM2 cron-restart, GitHub Actions cron, AWS EventBridge, or any HTTP scheduler. Secret is the `CRON_SECRET` env var.

## Development

```bash
npm install
npx prisma generate
npx prisma db push   # syncs schema to local Postgres
npm run dev          # http://localhost:3003
```

## Deploy

See `CLAUDE.md` for the canonical EC2 deploy steps (consolidated infra at `13.50.90.196`).
