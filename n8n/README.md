# n8n daily content pipeline

This replaces the GitHub Actions daily loop (`.github/workflows/daily-content.yml`)
with a self-contained n8n workflow. Same behaviour, more visibility.

## What it does

Every day at 06:00 UTC:

1. Fetch `content/topics.csv` from GitHub.
2. Pick one highest-priority pending topic per cluster (10 clusters → 10 topics).
3. For each topic:
   - Search quran.com for relevant verses.
   - Search sunnah.com for relevant hadiths.
   - Build a strict source-grounded prompt.
   - Call DeepSeek (`deepseek-chat`).
   - Auto-fix known MDX bugs (unquoted `<Arabic>` blocks, `<url>` autolinks, JSON-escaped attributes).
   - Validate `<Citation>` refs against fetched sources.
   - Attribution guard: "the Prophet said" / "Allah says" must have a nearby source anchor.
   - If validated → commit the MDX directly to `main` via the GitHub Contents API.
   - If flagged → skip commit; the topic gets marked `needs_review` in `topics.csv`.
4. Update `content/topics.csv` with new statuses.
5. Send a Slack/Discord/webhook notification with the day's summary.

DigitalOcean App Platform auto-deploys on the resulting commit.

## Import into n8n

1. In n8n → **Workflows** → **Import from File** → select `rassoul-daily-content.json`.
2. The workflow imports with placeholder credential IDs. You'll need to attach real credentials to the three HTTP-with-auth nodes (see below).
3. Set the required environment variables under **Settings → Environments** (or your `.env` if self-hosted).
4. Click **Test workflow** once. If the run succeeds, toggle **Active** on.

## Credentials to create

Create these under n8n's **Credentials** menu as `Header Auth` type. The workflow's HTTP nodes reference them by ID.

| Credential | Header name | Header value |
|---|---|---|
| **GitHub PAT** | `Authorization` | `Bearer <your-github-personal-access-token>` |
| **DeepSeek API Key** | `Authorization` | `Bearer <your-deepseek-key>` |
| **Sunnah.com API Key** | `X-API-Key` | `<your-sunnah-key>` |

After creating them in the UI, edit the workflow JSON's node credentials to reference each by its real n8n credential ID (n8n will assign a new UUID; just click the credential dropdown on each HTTP node and pick the one you made).

### GitHub PAT permissions

The token needs at minimum:
- `contents: write` on `abesn/rassoul` (to PUT MDX + topics.csv commits)

If you use a fine-grained PAT: scope to the `rassoul` repository only. If classic: `repo` scope is enough.

## Environment variables

Set these at the n8n workflow level (or globally if you host yourself):

| Variable | Example | Purpose |
|---|---|---|
| `RASSOUL_REPO` | `abesn/rassoul` | Which GitHub repo to commit to |
| `NOTIFY_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | Where to send the daily summary (Slack, Discord webhook, or any endpoint that accepts `{text: string}`) |

DeepSeek model is hardcoded to `deepseek-chat` in the "Call DeepSeek" node's body. Change to `deepseek-reasoner` there if you want R1.

## Cost expectations

- **DeepSeek:** ~$0.003 per post × 10 posts/day × 30 days ≈ **$1/month**.
- **n8n:** whatever you already pay for your instance.
- **GitHub API + DO App Platform:** free (well within limits).
- **Sunnah.com API:** free.

## What lives where

| Concern | Where |
|---|---|
| Schedule | Schedule Trigger node (cron `0 6 * * *`) |
| Topic queue | `content/topics.csv` in the repo |
| Source fetching | HTTP nodes (Search Quran / Search Sunnah) |
| LLM prompt | Code node "Build LLM prompt" — full system prompt inline |
| LLM call | HTTP node "Call DeepSeek" — swap URL/model to move providers |
| MDX auto-fix + validation | Code node "Process & validate MDX" — pure JS, no external deps |
| Commit to main | HTTP node "PUT MDX to main" (per-post) + "PUT topics.csv" (once at end) |
| Notification | HTTP node "Notify (Slack/Discord)" |

## Why replace GH Actions?

The old pipeline was correct but silent — the build gate could hold the daily PR open for days without you knowing. This workflow:

- Runs visibly (n8n dashboard shows each execution)
- Notifies on every completion (you always know today's outcome)
- Commits directly to `main` when a post passes all guards (no PR ceremony)
- Skips broken posts individually (one bad post doesn't hold the batch)

## Failure modes and how they surface

| What breaks | What happens | Visibility |
|---|---|---|
| DeepSeek returns an error | That topic is skipped; other clusters continue | Marked `failed` in topics.csv |
| Citations don't match sources | Topic marked `needs_review`; MDX not committed | Notes in topics.csv row |
| Uncited "Prophet said" | Topic marked `needs_review`; MDX not committed | Notes in topics.csv row |
| MDX auto-fix can't repair | Marked `needs_review` | Notes in topics.csv row |
| DO build fails on a slipped-through bug | DO's build fails, site stays on previous version | DO email + notification webhook shows abnormal counts |
| GitHub API rate limit | HTTP node fails, iteration aborts | n8n dashboard shows red run |

## Reverting

The old GH Actions workflow lives at [`.github/workflows/daily-content.yml`](../.github/workflows/daily-content.yml) — deleted in the commit that added this. Revert that commit and disable this n8n workflow to switch back.

## Known limitations of this template

The JSON is written for n8n v1.x. If you're on a different major version:
- **Schedule Trigger:** may want `typeVersion` bump — n8n editor will offer to migrate.
- **HTTP Request:** typeVersion 4.2 assumed; older versions have different param shapes for `sendBody`/`specifyBody`. The editor will highlight incompatibilities.
- **Code node:** typeVersion 2 assumed; API is stable across recent versions.

You may need to click through and re-attach the credential dropdowns after import — n8n assigns fresh UUIDs to imported credential references.
