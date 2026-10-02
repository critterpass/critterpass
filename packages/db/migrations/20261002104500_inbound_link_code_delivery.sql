-- The "Link this email?" code is emailed by the Email Worker with Cloudflare's reply, which can
-- refuse (no valid DMARC result, or a reply recipient that is not the incoming envelope sender).
-- The Worker now reports whether each reply went out, so the app asks for a code only when one did.
--
-- inbound_sender_links.code_delivery (privacy class C2: a delivery state, no address or code):
-- `pending` from the moment a code is issued until the Worker reports, `sent` once the reply went
-- out, `failed` when Cloudflare refused it (the code is cleared at the same time, so a later forward
-- from that sender issues and tries a new one). NULL for codes issued before reports existed: they
-- are not known to have been sent.
--
-- crew_inbound_addresses.held_code_until (privacy class C2: a time, nothing about the mail or its
-- sender): the latest expiry of a code that was sent for mail the crew address is holding; NULL
-- when none was. Synced with the row, so the app shows ENTER THE CODE only before that time and
-- otherwise says no code went out. The server recomputes it with held_count.
--
-- Both tables keep their forced RLS and grants; the ops console reads the new counter like the
-- other held-mail columns.

ALTER TABLE inbound_sender_links
  ADD COLUMN code_delivery text CHECK (code_delivery IN ('pending', 'sent', 'failed'));

ALTER TABLE crew_inbound_addresses ADD COLUMN held_code_until timestamptz;

GRANT SELECT (held_code_until) ON crew_inbound_addresses TO admin_reader;
