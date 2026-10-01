/**
 * How much forwarded mail the crew address is holding from addresses nobody in the crew has
 * linked yet, on the crew's active address row (synced to its members, who see "Mail is waiting"
 * and enter the code the sender was emailed). Recounted from the mail itself whenever mail is held
 * or released, so it never drifts. Runs in the caller's transaction as the system role.
 */
import type pg from 'pg';

export async function refreshHeldMail(tx: pg.PoolClient, crewId: string): Promise<void> {
  await tx.query(
    `UPDATE crew_inbound_addresses a
        SET held_count = h.n, held_at = h.newest
       FROM (SELECT count(*)::int AS n, max(created_at) AS newest FROM inbound_emails
              WHERE crew_id = $1 AND status = 'quarantined'
                AND quarantine_reason = 'unknown_sender') h
      WHERE a.crew_id = $1 AND a.status = 'active'
        AND (a.held_count, a.held_at) IS DISTINCT FROM (h.n, h.newest)`,
    [crewId],
  );
}
