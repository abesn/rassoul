-- rassoul.org D1 schema
-- Replaces content/topics.csv and content/posts/**/*.mdx as the content source of truth.

-- ─────────────────────────────────────────────────────────────
-- topics: the editorial backlog. n8n reads from here to pick the day's batch.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
  slug                TEXT NOT NULL,
  cluster             TEXT NOT NULL,
  title               TEXT NOT NULL,
  keyword             TEXT NOT NULL,
  search_volume       INTEGER DEFAULT 0,
  keyword_difficulty  INTEGER,
  cpc                 REAL,
  priority_score      INTEGER DEFAULT 0,
  intent              TEXT,
  -- 'pending' | 'published' | 'needs_review' | 'failed' | 'skip'
  status              TEXT NOT NULL DEFAULT 'pending',
  last_attempt_at     TEXT,
  published_at        TEXT,
  url                 TEXT,
  PRIMARY KEY (cluster, slug)
);

-- Index for the daily picker: "next pending topic per cluster, by priority"
CREATE INDEX IF NOT EXISTS idx_topics_pick_next
  ON topics (cluster, status, priority_score DESC);

-- ─────────────────────────────────────────────────────────────
-- posts: the actual content. n8n writes pre-rendered HTML.
-- The site reads directly from here at request time.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  slug          TEXT NOT NULL,
  cluster       TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  keyword       TEXT,
  html          TEXT NOT NULL,          -- pre-compiled HTML from n8n
  raw_mdx       TEXT,                    -- original MDX for reference/re-render
  citations     TEXT,                    -- JSON array of source URLs
  review_notes  TEXT,                    -- JSON array of validation notes
  status        TEXT NOT NULL DEFAULT 'published', -- 'published' | 'needs_review'
  published_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (cluster, slug)
);

CREATE INDEX IF NOT EXISTS idx_posts_recent
  ON posts (published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_cluster_recent
  ON posts (cluster, published_at DESC);
