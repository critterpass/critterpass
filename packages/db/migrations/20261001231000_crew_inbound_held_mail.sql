-- Mail forwarded to a crew address from an address nobody in the crew has used is held until a
-- member links that address with the code it was emailed. The crew's address row (already synced
-- to its members) carries how many such messages are held and when the newest came in, so the app
-- can show "Mail is waiting" without syncing the mail itself: no sender, subject or hash leaves the
-- server. The server keeps both in step when mail is held and when a link releases it.

ALTER TABLE crew_inbound_addresses
  ADD COLUMN held_count integer NOT NULL DEFAULT 0 CHECK (held_count >= 0),
  ADD COLUMN held_at timestamptz;

UPDATE crew_inbound_addresses a
   SET held_count = h.n, held_at = h.newest
  FROM (SELECT crew_id, count(*)::int AS n, max(created_at) AS newest
          FROM inbound_emails
         WHERE status = 'quarantined' AND quarantine_reason = 'unknown_sender'
         GROUP BY crew_id) h
 WHERE a.crew_id = h.crew_id AND a.status = 'active';

-- The ops console reads the same two counters (no mail content): the privacy map's grant.
GRANT SELECT (held_at, held_count) ON crew_inbound_addresses TO admin_reader;
