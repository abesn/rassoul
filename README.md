# Rassoul

> Source-grounded da'wah content site. Next.js 15 + Cloudflare Pages + D1 (SQLite at edge). n8n publishes daily.

Every post is built from primary sources (sunnah.com, quran.com). AI cannot invent or paraphrase hadith and ayat from memory — a strict citation guard rejects anything unverified.

## Architecture

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│  n8n cron   │──▶│  DeepSeek + APIs │──▶│  /api/admin/publish │
│  (daily)    │    │  RAG + validate  │    │  → D1 (Cloudflare)  │
└─────────────┘    └──────────────────┘    └──────────┬──────────┘
                                                       │
                        ┌──────────────────────────────▼─────────┐
                        │  Cloudflare Pages (Next.js on edge)    │
                        │  Reads D1 on request → HTML served     │
                        │  Also hosts: chatbot, donate flow      │
                        └────────────────────────────────────────┘
```

- **Content lives in D1**, not git. New posts appear on the site the moment `/api/admin/publish` completes — no rebuild.
- **n8n never touches GitHub**. It reads/writes only to `/api/admin/*` endpoints (Bearer-token auth).
- **Site source code lives in this repo**. Deploy via `npm run cf:deploy`.

## The 10 content clusters

Duas · Sirah · Hadith · 99 Names of Allah · Names of the Messenger ﷺ · Quran · Sunnah · Ramadan · Hajj · Da'wah

Routes: `/{cluster}` for the index, `/{cluster}/{slug}` for individual posts.

## Deployment

**Fresh deploy to Cloudflare Pages:** see [`CLOUDFLARE.md`](CLOUDFLARE.md). Covers D1 creation, schema migration, content seeding, secret setup, DNS cutover, n8n reconfiguration.

## Local development

```bash
npm install
cp .env.example .env.local          # fill DEEPSEEK_API_KEY, SUNNAH_API_KEY, etc.
npm run cf:migrate:local            # apply D1 schema locally
npm run cf:generate-seed             # generate seed.sql from content/**
npm run cf:seed:local                # load into local D1
npm run cf:dev                       # local dev with real D1 binding
```

Regular `npm run dev` (without `cf:dev`) won't have the D1 binding — pages that read from D1 will error.

## Content pipeline (n8n)

See [`n8n/README.md`](n8n/README.md) and the workflow at [`n8n/rassoul-cf-daily.json`](n8n/rassoul-cf-daily.json).

Every day at 14:00 UTC + random 0-59 minutes:

1. GET `/api/admin/topics-next-batch` — server returns one top-priority pending topic per cluster
2. For each topic: search Quran + Sunnah for sources, call DeepSeek with strict source-grounded prompt
3. Auto-fix known MDX bugs (unquoted `<Arabic>`, `<url>` autolinks, escaped attrs)
4. Validate citations against fetched sources; run attribution guard for uncited "the Prophet said"
5. If passing: compile MDX → HTML, POST to `/api/admin/publish`
6. If failing: POST to `/api/admin/mark-failed` (topic won't be re-picked)
7. Email summary of the day's counts

## Costs

- Cloudflare Pages: free
- Cloudflare D1: free (way under quotas)
- DeepSeek: ~$1/month at 10 posts/day
- Upstash Redis: free tier
- n8n: whatever you already pay
- **Total: ~$1/month**

## Repo layout

```
app/
  (site)/[cluster]/                 Dynamic cluster index + [slug] post page
  (site)/names-of-allah/            99-card grid (D1-backed)
  api/admin/                        publish, topics-next-batch, mark-failed (Bearer auth)
  api/chat/                         Streaming chat (edge, DeepSeek)
  api/donate/                       Stripe Checkout + webhook (edge, raw fetch)
  page.tsx, sitemap.ts, feed.xml/   Home, sitemap, RSS
components/
  post-renderer.tsx                 dangerouslySetInnerHTML from D1 posts.html
  chat-widget.tsx                   Floating chat button, SSE consumer
  site-header.tsx                   Sticky nav with hamburger
lib/
  d1.ts                             getDB() + Env type
  posts.ts                          D1 queries for posts + topics
  chat-rag.ts                       Quran + Sunnah + D1 local corpus
  llm.ts                            DeepSeek fetch (edge-compatible)
  stripe-fetch.ts                   Stripe via raw fetch + subtle crypto
  rate-limit.ts, donor.ts           Upstash + JWT cookie
  auth.ts                           Bearer verification for /api/admin/*
migrations/
  0001_initial.sql                  posts + topics tables
  seed.sql                          Generated from content/ by cf:generate-seed
n8n/
  rassoul-cf-daily.json             New workflow — writes to /api/admin/publish
  rassoul-daily-content.json        OLD workflow (GitHub-based) — kept for reference
content/                            Legacy MDX + topics.csv, used only to seed D1
scripts/cf/generate-seed.ts        Content migration script
wrangler.toml                       CF config + D1 binding
```

## License

Content: CC BY-SA 4.0. Code: MIT.
