# Rassoul

> Source-grounded da'wah content site. Next.js + MDX + a daily AI content loop.

A long-tail SEO content site on the rassoul.org domain. Every post is built from
primary sources (sunnah.com, quran.com) — the AI generator is forbidden from inventing
or paraphrasing hadith and ayat from memory.

## What this is

- **Stack:** Next.js 15 (App Router) + MDX + Tailwind + TypeScript. Deploys to DigitalOcean App Platform.
- **Content:** lives in `content/posts/<cluster>/<slug>.mdx`. Each cluster maps to a
  top-level route (`/duas`, `/sirah`, `/hadith`, `/names-of-allah`, etc.).
- **Pipeline:** `content/topics.csv` holds the editorial backlog (~450 rows ranked by
  SEO opportunity). **Every day at 06:00 UTC**, a GitHub Action picks **one topic per
  cluster** (10 clusters → up to 10 posts), fetches primary sources, asks Claude to
  write each post with strict citation rules, validates every `<Citation>` against the
  fetched sources, and opens a single PR.
- **You merge.** The site rebuilds automatically.

### The 10 clusters
Duas · Sirah · Hadith · 99 Names of Allah · Names of the Messenger ﷺ · Quran · Sunnah · Ramadan · Hajj · Da'wah

## Quickstart

```bash
npm install
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY (and SUNNAH_API_KEY if you have one)
npm run dev
```

Open <http://localhost:3000>.

## The daily content pipeline

Daily content generation runs in **n8n**, not GitHub Actions. See
[`n8n/README.md`](n8n/README.md) for setup, credentials, and workflow details.

**In one paragraph:** every day at 06:00 UTC the n8n workflow fetches `content/topics.csv`,
picks one highest-priority pending topic per cluster (10 clusters → 10 posts), searches
sunnah.com + quran.com for primary sources, calls DeepSeek to write each post with strict
citation rules, auto-fixes known MDX bugs, validates each post's citations and
attributions, and commits the passing posts directly to `main` via the GitHub Contents
API. Flagged posts are marked `needs_review` in `topics.csv` and skipped (not committed).
DigitalOcean App Platform auto-deploys on the resulting commit. A Slack/Discord webhook
notifies you of the day's summary.

### Cost expectations

- **DeepSeek:** ~$0.003/post × 10/day × 30 = **~$1/month**.
- **n8n:** whatever you already pay for your instance.
- **Topics backlog:** ~450 rows in `content/topics.csv` = ~45 days of runway.
  Regenerate with `python3 tmp/build-topics.py` when you're getting low.

### Required credentials (in n8n, not GitHub)

- GitHub personal access token with `contents: write` on `abesn/rassoul`
- DeepSeek API key — https://platform.deepseek.com/api_keys
- Sunnah.com API key — https://sunnah.com/developers (free, optional but recommended)

See [`n8n/README.md`](n8n/README.md) for step-by-step setup.

### Reverting to the old GH Actions pipeline

The old workflow (`.github/workflows/daily-content.yml`) and generator
(`scripts/generate-daily-content.ts`) were removed in the commit that added n8n.
`git log --all -- .github/workflows/daily-content.yml` will find the deletion; revert
that commit to restore the Actions-based pipeline.

## Repo layout

```
app/                    Next.js App Router
  (site)/<cluster>/     Cluster index + dynamic [slug] route per cluster
  feed.xml/route.ts     RSS feed
  sitemap.ts            Auto-generated sitemap.xml
  robots.ts             robots.txt
components/             cluster-index.tsx, post-renderer.tsx, MDX components
content/
  topics.csv            Editorial backlog (200 rows, ranked by priority_score)
  posts/<cluster>/      Generated MDX files
lib/
  posts.ts              MDX loading + cluster metadata
  sources.ts            sunnah.com + quran.com clients with graceful fallback
n8n/
  rassoul-daily-content.json   Workflow template — import into your n8n instance
  README.md                    Setup + credential mapping
.github/workflows/
  ci.yml                Build/typecheck on every push
```

## Adding new topics

Open `content/topics.csv` and add rows. Required columns:

| Column | Notes |
|---|---|
| slug | URL slug, kebab-case |
| title | Post title (this is what the AI writes about) |
| cluster | One of: duas, sirah, hadith, names-of-allah, names-of-the-messenger, quran, sunnah, ramadan, hajj, dawah |
| keyword | The search keyword the post should rank for |
| search_volume | Monthly US Google search volume (from DataForSEO or similar) |
| keyword_difficulty | 0–100 (DataForSEO scale) |
| cpc | Average cost-per-click in USD |
| priority_score | `search_volume / (keyword_difficulty + 5) * 100`. Generator orders by this desc. |
| intent | "informational" / "transactional" / "navigational" |
| status | `pending`, `published`, `needs_review`, or `skip` |

The generator only touches `pending` rows.

## Content rules (enforced in the prompt)

Every post must:

1. Cite every hadith inline with `<Citation source="..." book="..." number="..." href="..." />`.
2. Cite every Quran verse the same way.
3. Use the `<Arabic>` component for Arabic blocks.
4. Refer to Prophet Muhammad with ﷺ.
5. Open with a 1–2 sentence answer to the search intent (answer-first formatting for SEO).
6. End with a "Sources" section listing every citation as plain markdown links.

The generator validates citations against fetched sources. Posts that fail validation
are marked `needs_review` in topics.csv — you'll see them in the PR.

## The chat assistant

A floating "Ask about the Prophet ﷺ" widget powered by Claude with strict RAG over
sunnah.com, quran.com, and the site's own MDX corpus. Sunni-default stance.

- **Free tier:** 5 questions per IP per day (configurable via `CHAT_FREE_DAILY_LIMIT`).
- **Unlimited tier:** any donation via Stripe Checkout (min $1) unlocks unlimited
  questions on that browser for 90 days via a signed `rassoul_donor` cookie.
- **Soft launch:** the widget is hidden by default. Visit any page with `?chat=1`
  to enable it on your browser. Set `NEXT_PUBLIC_CHAT_PUBLIC=1` to make it visible
  to everyone.

### Architecture

```
User Q  →  /api/chat
            ├─ donor cookie? → bypass rate limit
            ├─ else: Upstash rate limit (5/day per IP)
            ├─ RAG retrieval:
            │    - quran.com search (top 4 verses)
            │    - sunnah.com search (top 6 hadith)
            │    - local MDX corpus (top 3 posts)
            ├─ Claude with strict citation system prompt
            └─ stream SSE response
```

### Required env vars

| Var | Source |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | https://console.upstash.com (free) |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | https://dashboard.stripe.com |
| `DONOR_COOKIE_SECRET` | `openssl rand -base64 48` |
| `NEXT_PUBLIC_SITE_URL` | `https://rassoul.org` |

### Stripe webhook

After deploying, add a webhook at https://dashboard.stripe.com/webhooks:
- URL: `https://rassoul.org/api/donate/webhook`
- Events: `checkout.session.completed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

The webhook records the session id in Upstash with a 90-day TTL; the success page
then exchanges that for a signed donor cookie.

### Safety notes

The chat system prompt forbids inventing hadith. If retrieval returns no sources,
Claude is instructed to decline rather than improvise. Every response cites every
factual claim inline. **Log the first few weeks of chat traffic** (it ships
unlogged by default; add Vercel KV or Postgres if you want to review) before you
remove the soft-launch flag.

## Monetization layer (set up later — when traffic warrants)

Don't add ads before ~5k monthly visitors. When you're ready:

- **[Muslim Ad Network](https://muslimadnetwork.com/)** — easiest approval, halal-vetted ads. Drop the ad tag in `app/layout.tsx`.
- **[Ezoic](https://www.ezoic.com/)** — accepts smaller sites, automated placement.
- **[Halal.Ad](https://www.halal.ad/)** — direct deals when you have meaningful traffic.

Affiliate spots to slot in:

- Quran translations on Amazon (in surah posts)
- Halal investing platforms (Zoya, Wahed) in any post mentioning rizq or wealth
- Islamic book publishers

## Deployment to DigitalOcean App Platform

Hosted as a single Node.js Web Service on App Platform Basic tier (~$5/mo, 512MB RAM).
Content pages are statically generated; API routes (`/api/chat`, `/api/donate/*`) run
as serverful endpoints.

The spec lives in [.do/app.yaml](.do/app.yaml). Two ways to deploy:

### Option A — UI (one-time)

1. Go to <https://cloud.digitalocean.com/apps/new>.
2. Connect GitHub, select `abesn/rassoul`, branch `main`.
3. App Platform auto-detects `.do/app.yaml`.
4. Click through. App Platform builds with `npm install && npm run build` and runs
   `npm start`.

### Option B — CLI

```bash
brew install doctl
doctl auth init
doctl apps create --spec .do/app.yaml
```

### After first deploy: set secrets

In the App Platform UI → Settings → App-Level Environment Variables, set the SECRET
envs (they're declared in `app.yaml` without values):

- `ANTHROPIC_API_KEY` — https://console.anthropic.com
- `SUNNAH_API_KEY` — https://sunnah.com/developers (free)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — https://console.upstash.com (free)
- `DONOR_COOKIE_SECRET` — generate with `openssl rand -base64 48`
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — https://dashboard.stripe.com

The deploy will redeploy automatically after you save secrets.

### Connect the domain

In the App Platform UI → Settings → Domains:

- Add `rassoul.org` as PRIMARY
- Add `www.rassoul.org` as ALIAS (already declared in `app.yaml`)

App Platform issues Let's Encrypt certs automatically — fixes the cert mismatch
you currently have on the apex.

At your registrar (Sav.com), update DNS:

| Record | Value |
|---|---|
| A `@` | `Use the IP shown in App Platform → Domains` (or use a CNAME flattening service) |
| CNAME `www` | `<your-app>.ondigitalocean.app` |

(App Platform will tell you the exact records to add after you submit the domain.)

### Configure the Stripe webhook

After the domain is live:

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://rassoul.org/api/donate/webhook`
3. Event: `checkout.session.completed`
4. Copy the signing secret → App Platform → Settings → Environment Variables →
   update `STRIPE_WEBHOOK_SECRET` → save (triggers a redeploy).

### Scaling

If `basic-xxs` (512MB) starts struggling under traffic, edit `.do/app.yaml`:

```yaml
instance_size_slug: basic-xs   # $12/mo, 1GB RAM
# or
instance_size_slug: basic-s    # $25/mo, 1GB RAM, 1 dedicated vCPU
```

Push to main. App Platform handles the rolling deploy.

## License

Content: CC BY-SA 4.0. Code: MIT.
