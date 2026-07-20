# Deploying rassoul.org to Cloudflare Pages + D1

Migration from DigitalOcean + GitHub-triggered deploys to Cloudflare Pages (edge runtime) + D1 (SQLite at edge). Content moves from MDX files in git to rows in D1. n8n writes directly to D1 via `/api/admin/publish` — no more GitHub PAT in the daily flow.

## Prerequisites

- Cloudflare account (any plan — free tier is enough)
- `wrangler` CLI: `npm install -g wrangler` then `wrangler login`
- Node 22.x locally
- Domain (`rassoul.org`) accessible in your Cloudflare account (see step 8)

## One-time setup

### 1. Install dependencies

```bash
npm install
```

Installs `wrangler`, `@cloudflare/next-on-pages`, and drops Node-only deps (`stripe`, `openai` SDK). Content generation replaced with edge-compatible `fetch` calls.

### 2. Create the D1 database

```bash
wrangler d1 create rassoul-content
```

Copy the returned `database_id` (a UUID) into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rassoul-content"
database_id = "PASTE_UUID_HERE"
```

### 3. Apply the schema

```bash
# Local (creates a local SQLite for dev)
npm run cf:migrate:local

# Production
npm run cf:migrate:prod
```

### 4. Migrate existing content into D1

Generates a `migrations/seed.sql` from your `content/posts/**/*.mdx` files and `content/topics.csv`:

```bash
npm run cf:generate-seed
```

Then apply it:

```bash
npm run cf:seed:local     # local dev
npm run cf:seed:prod      # production
```

The seed script does a lightweight MDX→HTML compile. New posts from n8n use the same compiler in the workflow's "Process & compile MDX" Code node.

### 5. Set secrets on Cloudflare Pages

```bash
wrangler pages secret put ADMIN_TOKEN --project-name=rassoul
# Enter a strong random string. Generate with: openssl rand -base64 48

wrangler pages secret put DEEPSEEK_API_KEY --project-name=rassoul
wrangler pages secret put SUNNAH_API_KEY --project-name=rassoul
wrangler pages secret put UPSTASH_REDIS_REST_URL --project-name=rassoul
wrangler pages secret put UPSTASH_REDIS_REST_TOKEN --project-name=rassoul
wrangler pages secret put DONOR_COOKIE_SECRET --project-name=rassoul
wrangler pages secret put STRIPE_SECRET_KEY --project-name=rassoul
wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name=rassoul
```

(If the project doesn't exist yet, create it via step 6 first, then set secrets.)

### 6. First deploy

```bash
npm run cf:deploy
```

This runs `@cloudflare/next-on-pages` (Vercel build adapter → CF Workers) then `wrangler pages deploy`. First deploy creates the Pages project automatically.

You'll get a `.pages.dev` URL for testing.

### 7. Bind D1 to the Pages project

Go to Cloudflare dashboard → **Workers & Pages → rassoul → Settings → Functions → D1 database bindings**:

- **Variable name:** `DB`
- **D1 database:** `rassoul-content`

Save. Redeploy: `npm run cf:deploy`.

### 8. DNS cutover — rassoul.org → Pages

In Cloudflare dashboard → **Pages → rassoul → Custom domains**:

- Add `rassoul.org` and `www.rassoul.org`
- Cloudflare auto-issues certs

If DNS is currently at another registrar/provider pointing at DigitalOcean:

- Move nameservers to Cloudflare (or add the Pages CNAME target as an ALIAS/CNAME)
- After propagation (~5 min), rassoul.org resolves to Pages

Verify: `https://rassoul.org` should show the new site backed by D1.

### 9. Configure Stripe webhook for the new URL

Same webhook, new endpoint. Stripe Dashboard → Developers → Webhooks → your existing endpoint → Edit URL to `https://rassoul.org/api/donate/webhook`. (URL is the same — but re-verify the signing secret in `STRIPE_WEBHOOK_SECRET`.)

### 10. Update n8n workflow

Import `n8n/rassoul-cf-daily.json` in your n8n instance.

**New Header Auth credential to create:**

- **Name:** Rassoul Admin Token
- **Header:** `Authorization`
- **Value:** `Bearer <the-ADMIN_TOKEN-you-generated-above>`

Attach to the three `/api/admin/*` nodes: `GET topics-next-batch`, `POST /api/admin/publish`, `POST /api/admin/mark-failed`.

Keep the DeepSeek + Sunnah credentials from the previous workflow.

**Env vars to set on the workflow:**

- `NOTIFY_FROM_EMAIL` — your Gmail (or provider)
- `NOTIFY_TO_EMAIL` — where daily summaries go

**Delete or disable the old GitHub-based workflow.** Both use the same schedule, so leaving both active would double-run.

## Decommissioning

Once you've verified rassoul.org works on Pages + n8n publishes end-to-end:

- **DigitalOcean:** delete the App Platform app (`doctl apps delete <app-id>`), delete the associated managed cert
- **GitHub PAT:** the daily workflow no longer uses it. Revoke it at https://github.com/settings/tokens
- **Repo:** keep it for source code only. No writes from n8n. You can optionally archive it if you don't plan to change the code often.

## Verifying the whole loop

1. `https://rassoul.org` renders the homepage with posts from D1
2. `https://rassoul.org/duas` shows the duas cluster
3. `https://rassoul.org/duas/<any-published-slug>` shows a post
4. `https://rassoul.org/api/admin/topics-next-batch` returns 401 without auth, 200 with `Authorization: Bearer <ADMIN_TOKEN>`
5. Chat widget: click "Ask about the Prophet ﷺ", ask a question, get streaming response
6. Donate flow: click Donate → Stripe Checkout → complete test payment → get donor cookie → chat becomes unlimited
7. n8n manual run: **Execute workflow** → email arrives with summary → new posts show up on the site immediately (no rebuild)

## What lives where

| Concern | Where |
|---|---|
| Site source code | GitHub repo (read-only now, deploy manually via `npm run cf:deploy`) |
| Content (posts, topics) | Cloudflare D1 database |
| Static assets (favicon, logo) | `public/` — bundled into Pages deployment |
| Chatbot rate limits, donor sessions | Upstash Redis (unchanged) |
| Donation payments | Stripe (unchanged, webhook now points at rassoul.org/api/donate/webhook) |
| Daily content pipeline | n8n → `/api/admin/publish` → D1 (no GitHub) |
| Email notifications | n8n SMTP node (Gmail App Password or similar) |

## Cost after migration

- **Cloudflare Pages:** free
- **Cloudflare D1:** free tier is 5M rows read/day, 100k writes/day — plenty
- **Cloudflare Workers requests:** free tier is 100k/day
- **DeepSeek:** ~$1/month
- **Upstash Redis:** free tier
- **Stripe:** transaction fees only
- **n8n:** whatever you already pay

Approximate total: **~$1/mo** (versus $5/mo on DO previously).

## Rollback

If something goes catastrophically wrong on Pages, revert DNS at Cloudflare Pages → Custom domains and re-add `rassoul.org` to your DigitalOcean app as PRIMARY. The DO deployment still works because we haven't destroyed it — until you explicitly `doctl apps delete`.
