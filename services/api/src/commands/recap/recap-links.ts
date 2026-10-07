/**
 * A recap's public link (docs/api-contracts.md §4.14 doc delta, §5.6): any traveller who can open
 * the recap makes a link once it is ready; the traveller who made a link, or an organiser of the
 * trip, switches it off. The token is returned once and only its hash is kept, so the page behind
 * it (`GET /v1/public/recap/{token}`) can never be found from the database.
 */
import { createHash, randomBytes } from 'node:crypto';

import { appendDomainEvent } from '@cp/db';
import {
  buildLink,
  createRecapLinkPayloadSchema,
  DomainError,
  linkHostsFor,
  RECAP_LINKS_MAX_LIVE,
  revokeRecapLinkPayloadSchema,
  type CreateRecapLinkResult,
  type LinkEnvironment,
  type RecapLinks,
  type RevokeRecapLinkResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { visibleRecap, type VisibleRecap } from './shared';

export function recapLinkTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Asked as the caller: co-organisers count, a crewmate without the role does not. */
async function organisesTrip(tx: pg.PoolClient, tripId: string): Promise<boolean> {
  const { rows } = await tx.query<{ organiser: boolean }>(
    'SELECT app.is_trip_organiser($1) AS organiser',
    [tripId],
  );
  return rows[0]?.organiser === true;
}

async function linkEvent(
  tx: pg.PoolClient,
  type: 'recap_link.created' | 'recap_link.revoked',
  recap: Pick<VisibleRecap, 'id' | 'trip_id'>,
  linkId: string,
  uid: string,
): Promise<void> {
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'recap',
    aggregateId: recap.id,
    actorKind: 'user',
    actorId: uid,
    tripId: recap.trip_id,
    payload: { trip_id: recap.trip_id, recap_id: recap.id, link_id: linkId },
  });
}

export function createRecapLinkCommand(linkEnv: LinkEnvironment) {
  return defineCommand({
    name: 'create_recap_link',
    v: 1,
    schema: createRecapLinkPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload) => {
      await visibleRecap(tx, payload.recap_id);
    },
    handle: async (tx, payload, ctx): Promise<CreateRecapLinkResult> => {
      const recap = await visibleRecap(tx, payload.recap_id);
      if (recap.status !== 'ready') throw new DomainError('STATE_INVALID', { reason: 'not_ready' });
      return asSystemRole(tx, async () => {
        // One writer per recap at a time, so the cap cannot be raced past.
        await tx.query('SELECT 1 FROM recaps WHERE id = $1 FOR UPDATE', [recap.id]);
        const { rows: live } = await tx.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM recap_links WHERE recap_id = $1 AND revoked_at IS NULL',
          [recap.id],
        );
        if ((live[0]?.n ?? 0) >= RECAP_LINKS_MAX_LIVE) {
          throw new DomainError('STATE_INVALID', { reason: 'too_many_links' });
        }
        const token = randomBytes(18).toString('base64url');
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO recap_links (recap_id, trip_id, token_hash, created_by)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [recap.id, recap.trip_id, recapLinkTokenHash(token), ctx.uid],
        );
        const linkId = (rows[0] as { id: string }).id;
        await linkEvent(tx, 'recap_link.created', recap, linkId, ctx.uid);
        const [host] = linkHostsFor(linkEnv);
        return {
          link_id: linkId,
          token,
          url: buildLink({ kind: 'recap_share', token }, { host, channel: 'copy' }),
        };
      });
    },
  });
}

export const revokeRecapLinkCommand = defineCommand({
  name: 'revoke_recap_link',
  v: 1,
  schema: revokeRecapLinkPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await visibleRecap(tx, payload.recap_id);
  },
  handle: async (tx, payload, ctx): Promise<RevokeRecapLinkResult> => {
    const recap = await visibleRecap(tx, payload.recap_id);
    const organiser = await organisesTrip(tx, recap.trip_id);
    return asSystemRole(tx, async () => {
      if (payload.link_id !== undefined) {
        const { rows } = await tx.query<{ created_by: string | null }>(
          'SELECT created_by FROM recap_links WHERE id = $1 AND recap_id = $2 FOR UPDATE',
          [payload.link_id, recap.id],
        );
        const link = rows[0];
        if (link === undefined) throw new DomainError('NOT_FOUND', { reason: 'link' });
        if (!organiser && link.created_by !== ctx.uid) {
          throw new DomainError('FORBIDDEN', { reason: 'not_your_link' });
        }
      }
      const { rows: revoked } = await tx.query<{ id: string }>(
        `UPDATE recap_links SET revoked_at = now(), revoked_by = $2
          WHERE recap_id = $1 AND revoked_at IS NULL
            AND ($3::uuid IS NULL OR id = $3::uuid)
            AND ($4::boolean OR created_by = $2)
        RETURNING id`,
        [recap.id, ctx.uid, payload.link_id ?? null, organiser],
      );
      for (const row of revoked) await linkEvent(tx, 'recap_link.revoked', recap, row.id, ctx.uid);
      return { revoked: revoked.length };
    });
  },
});

/** The recap's live links, read as the caller: a traveller of the recap, or `NOT_FOUND`. */
export async function readRecapLinks(
  tx: pg.PoolClient,
  recapId: string,
  uid: string,
): Promise<RecapLinks> {
  const recap = await visibleRecap(tx, recapId);
  const organiser = await organisesTrip(tx, recap.trip_id);
  const { rows } = await tx.query<{ id: string; created_by: string | null; created_at: Date }>(
    `SELECT id, created_by, created_at FROM recap_links
      WHERE recap_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC, id DESC`,
    [recap.id],
  );
  return {
    trip_id: recap.trip_id,
    links: rows.map((row) => ({
      link_id: row.id,
      mine: row.created_by === uid,
      can_revoke: organiser || row.created_by === uid,
      created_at: row.created_at.toISOString(),
    })),
  };
}
