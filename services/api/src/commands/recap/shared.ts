/**
 * What the recap commands share: the recap as its caller may see it (row security already limits
 * it to the trip's travellers still in the crew), and the signature fan-out that writes a
 * traveller's signature on every crew member's trip stamp and tells the recap's live channel.
 */
import { outbox } from '@cp/db';
import { channelName, DomainError, RECAP_RT } from '@cp/domain';
import type pg from 'pg';

export interface VisibleRecap {
  readonly id: string;
  readonly trip_id: string;
  readonly status: string;
  readonly mvp_closes_at: Date | null;
  readonly mvp_closed_at: Date | null;
}

/** The recap if the caller is one of its viewers; `NOT_FOUND` otherwise (nothing leaks). */
export async function visibleRecap(tx: pg.PoolClient, recapId: string): Promise<VisibleRecap> {
  const { rows } = await tx.query<VisibleRecap>(
    'SELECT id, trip_id, status, mvp_closes_at, mvp_closed_at FROM recaps WHERE id = $1',
    [recapId],
  );
  const recap = rows[0];
  if (recap === undefined) throw new DomainError('NOT_FOUND', { reason: 'recap' });
  return recap;
}

/**
 * Signs every crew member's trip stamp with `signer`'s stroke (null until they draw one) and
 * publishes the signature on `recap:{id}`; resolves to how many stamps it newly signed. Runs as the
 * system: a traveller writes on other people's stamps only through this.
 */
export async function signStamps(
  tx: pg.PoolClient,
  recap: Pick<VisibleRecap, 'id' | 'trip_id'>,
  signer: string,
  now: Date,
): Promise<number> {
  const { rows: setting } = await tx.query<{ key: string | null }>(
    'SELECT signature_media_key AS key FROM user_settings WHERE user_id = $1',
    [signer],
  );
  const stroke = setting[0]?.key ?? null;
  const signed = await tx.query(
    `INSERT INTO stamp_signatures (stamp_id, trip_id, recap_id, signer_id, stroke_media_key, signed_at)
     SELECT s.id, s.trip_id, $2, $3, $4, $5
       FROM stamps s JOIN recap_views v ON v.user_id = s.user_id AND v.recap_id = $2
      WHERE s.trip_id = $1 AND s.kind = 'trip'
     ON CONFLICT (stamp_id, signer_id) DO NOTHING`,
    [recap.trip_id, recap.id, signer, stroke, now],
  );
  await outbox(tx, channelName('recap', recap.id), RECAP_RT.signature, {
    signer_id: signer,
    stroke_media_key: stroke,
    signed_at: now.toISOString(),
  });
  return signed.rowCount ?? 0;
}
