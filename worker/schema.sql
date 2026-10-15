-- D1 schema for story submissions. Rows are read only by the owner (pnpm stories:moderate) and by the deploy pipeline (pnpm stories:fetch, approved rows only). Never exported into git.
CREATE TABLE IF NOT EXISTS stories (
  id              TEXT PRIMARY KEY,                 -- st-<random>
  exhibit_id      TEXT NOT NULL,
  display_name    TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 60),
  role            TEXT CHECK (role IS NULL OR length(role) <= 80),
  country         TEXT CHECK (country IS NULL OR length(country) = 2),
  original_lang   TEXT NOT NULL CHECK (original_lang IN ('pt','en','es','de','it','other')),
  year_of_memory  INTEGER CHECK (year_of_memory IS NULL OR year_of_memory BETWEEN 1960 AND 2100),
  text            TEXT NOT NULL CHECK (length(text) BETWEEN 40 AND 1500),
  contact_email   TEXT,                             -- optional, used only to confirm publication or removal
  consent_display INTEGER NOT NULL DEFAULT 0,       -- 1 = agreed to publish with display name under CC BY 4.0
  consent_mt      INTEGER NOT NULL DEFAULT 0,       -- 1 = agreed to machine translation
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  submitted_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at     TEXT,
  ip_hash         TEXT                              -- sha256(ip + daily salt), purged after 30 days
);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_stories_exhibit ON stories(exhibit_id);
CREATE INDEX IF NOT EXISTS idx_stories_iphash ON stories(ip_hash, submitted_at);
