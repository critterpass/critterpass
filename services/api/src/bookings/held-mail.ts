/**
 * How much forwarded mail the crew address is holding from addresses nobody in the crew has
 * linked yet, on the crew's active address row (synced to its members, who see "Mail is waiting").
 * `held_code_until` is the latest expiry of a link code the Worker reported as sent for one of
 * those senders: the app asks for a code only before then, and otherwise says no code went out.
 * Recounted from the mail and the sender links whenever mail is held or released or a reply's
 * delivery is reported, so it never drifts. Runs in the caller's transaction as the system role.
 */
import type pg from 'pg';

export async function refreshHeldMail(tx: pg.PoolClient, crewId: string): Promise<void> {
  await tx.query(
    `UPDATE crew_inbound_addresses a
        SET held_count = h.n, held_at = h.newest, held_code_until = h.code_until
       FROM (SELECT count(*)::int AS n, max(e.created_at) AS newest,
                    (SELECT max(l.code_expires_at) FROM inbound_sender_links l
                      WHERE l.crew_id = $1 AND l.code_delivery = 'sent'
                        AND l.code_hash IS NOT NULL AND l.verified_at IS NULL
                        AND EXISTS (SELECT 1 FROM inbound_emails q
                                     WHERE q.crew_id = $1 AND q.sender_hash = l.sender_hash
                                       AND q.status = 'quarantined'
                                       AND q.quarantine_reason = 'unknown_sender')) AS code_until
               FROM inbound_emails e
              WHERE e.crew_id = $1 AND e.status = 'quarantined'
                AND e.quarantine_reason = 'unknown_sender') h
      WHERE a.crew_id = $1 AND a.status = 'active'
        AND (a.held_count, a.held_at, a.held_code_until)
            IS DISTINCT FROM (h.n, h.newest, h.code_until)`,
    [crewId],
  );
}
