# Rassoul

> Source-grounded da'wah content site. Next.js + MDX + a weekly AI content loop.

A long-tail SEO content site sitting on the rassoul.org domain. Every post is built from
primary sources (sunnah.com, quran.com) — the AI generator is forbidden from inventing
or paraphrasing hadith and ayat from memory.

## What this is

- **Stack:** Next.js 15 (App Router) + MDX + Tailwind + TypeScript. Deploys to Vercel.
- **Content:** lives in `content/posts/<cluster>/<slug>.mdx`. Each cluster maps to a
  top-level route (`/duas`, `/sirah`, `/hadith`, `/names-of-allah`, etc.).
- **Pipeline:** `content/topics.csv` holds the editorial backlog (200 rows ranked by
  SEO opportunity). A weekly GitHub Action picks the next N pending topics, fetches
  primary sources, asks Claude to write the post with strict citation rules, validates
  every `<Citation>` against the fetched sources, and opens a PR.
- **You merge.** The site rebuilds automatically.

## Quickstart

```bash
pnpm install
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY (and SUNNAH_API_KEY if you have one)
pnpm run dev
```

Open <http://localhost:3000>.

## Running the content generator manually

```bash
# Dry-run: shows what would be picked + what sources are available, no API calls
pnpm run generate:dry

# Real run: writes 2 posts (or POSTS_PER_RUN) to content/posts/**
pnpm run generate:weekly
```

After it runs, `topics.csv` rows for the published posts flip from `pending` to either
`published` or `needs_review`. Rows flagged `needs_review` had at least one citation
that couldn't be matched against a fetched source — read those before merging.

## The weekly loop (in production)

1. GitHub Action fires every Monday 06:00 UTC.
2. It runs `pnpm run generate:weekly` against `topics.csv`.
3. It opens a PR titled `Weekly da'wah content — <run_id>`.
4. You review and merge (or close).
5. Vercel rebuilds on merge to `main`.

To trigger a run manually, go to Actions → "Weekly content generation" → Run workflow.

## Required secrets (GitHub repo settings → Secrets)

- `ANTHROPIC_API_KEY` — for the generator.
- `SUNNAH_API_KEY` — optional but recommended. Free at <https://sunnah.com/developers>.

`GITHUB_TOKEN` is provided automatically by Actions; no setup needed for the PR step.

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
scripts/
  generate-weekly-content.ts   The weekly loop
.github/workflows/
  weekly-content.yml    Mon 06:00 UTC cron → opens PR
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

## Monetization layer (set up later — when traffic warrants)

Don't add ads before ~5k monthly visitors. When you're ready:

- **[Muslim Ad Network](https://muslimadnetwork.com/)** — easiest approval, halal-vetted ads. Drop the ad tag in `app/layout.tsx`.
- **[Ezoic](https://www.ezoic.com/)** — accepts smaller sites, automated placement.
- **[Halal.Ad](https://www.halal.ad/)** — direct deals when you have meaningful traffic.

Affiliate spots to slot in:

- Quran translations on Amazon (in surah posts)
- Halal investing platforms (Zoya, Wahed) in any post mentioning rizq or wealth
- Islamic book publishers

## Deployment to Vercel

```bash
vercel link
vercel env add NEXT_PUBLIC_SITE_URL production  # https://rassoul.org
vercel --prod
```

Or just import the GitHub repo at <https://vercel.com/new>. Connect the domain in
the Vercel dashboard → Domains → Add → `rassoul.org`.

DNS at your registrar (Sav.com): point the apex A record (or use `ALIAS`/`ANAME`) to
Vercel's IP per their setup wizard. This will also fix the cert mismatch you currently
have on the apex.

## License

Content: CC BY-SA 4.0. Code: MIT.
