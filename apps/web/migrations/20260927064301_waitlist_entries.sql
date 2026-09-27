-- Coming-soon waitlist: one row per sign-up, plus a hashed-IP rate-limit counter for the join
-- endpoint. Privacy class C2 (email address) — see docs/undesigned-states.md and the coming-soon
-- privacy page for what is collected and why.

CREATE TABLE waitlist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL,
  referred_by_handle TEXT REFERENCES waitlist_entries (handle),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_waitlist_entries_referred_by_handle ON waitlist_entries (referred_by_handle);

CREATE TABLE waitlist_rate_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start_ms INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);
