/**
 * Researched opening hours in the ops console: the open proposals (with their source link), and
 * `verify_poi_hours`, which is the only path by which researched hours reach a POI. Verifying
 * copies the hours onto the POI with `hours_verified_at`, the flag OPEN NOW and fit checks trust;
 * rejecting leaves the POI untouched.
 */
import { enqueueRealtime } from '@cp/db';
import {
  CATALOG_CHANNEL,
  DomainError,
  hoursProposalListSchema,
  verifyPoiHoursPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from '../reads';
import {
  defineAdminCommand,
  defineAdminRead,
  type AnyAdminCommand,
  type AnyAdminRead,
} from '../registry';

export function hoursReads(pool: pg.Pool): readonly AnyAdminRead[] {
  return [
    defineAdminRead({
      path: '/content/hours',
      area: 'content',
      summary: 'Opening hours proposals waiting for verification',
      response: hoursProposalListSchema,
      run: ({ admin }) =>
        withAdminReader(pool, admin.uid, async (tx) => {
          const { rows } = await tx.query<{
            id: string;
            poi_id: string;
            poi_name: string;
            destination: string;
            hours: Record<string, unknown>;
            source_url: string;
            fetched_at: Date;
            batch_key: string;
          }>(
            `SELECT h.id, h.poi_id, p.name AS poi_name, d.slug AS destination, h.hours, h.source_url, h.fetched_at,
               h.batch_key
             FROM poi_hours_proposals h JOIN pois p ON p.id = h.poi_id JOIN destinations d ON d.id = p.destination_id
             WHERE h.status = 'proposed' ORDER BY d.slug, p.name LIMIT 200`,
          );
          return hoursProposalListSchema.parse({
            items: rows.map((row) => ({ ...row, fetched_at: row.fetched_at.toISOString() })),
          });
        }),
    }),
  ];
}

export function hoursCommands(): readonly AnyAdminCommand[] {
  return [
    defineAdminCommand({
      name: 'verify_poi_hours',
      schema: verifyPoiHoursPayloadSchema,
      audit: (payload) => ({
        targetKind: 'poi_hours_proposal',
        targetId: payload.proposal_id,
        detail: { verdict: payload.verdict },
      }),
      async handle(tx, payload, ctx) {
        const { rows } = await tx.query<{ poi_id: string; hours: unknown; status: string }>(
          'SELECT poi_id, hours, status FROM poi_hours_proposals WHERE id = $1 FOR UPDATE',
          [payload.proposal_id],
        );
        const proposal = rows[0];
        if (proposal === undefined) throw new DomainError('NOT_FOUND');
        if (proposal.status !== 'proposed') {
          throw new DomainError('STATE_INVALID', {
            reason: 'already_decided',
            status: proposal.status,
          });
        }
        const status = payload.verdict === 'verify' ? 'verified' : 'rejected';
        await tx.query(
          'UPDATE poi_hours_proposals SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1',
          [payload.proposal_id, status, ctx.admin.uid],
        );
        if (status === 'verified') {
          await tx.query('UPDATE pois SET hours = $2, hours_verified_at = now() WHERE id = $1', [
            proposal.poi_id,
            JSON.stringify(proposal.hours),
          ]);
          await enqueueRealtime(tx, {
            channel: CATALOG_CHANNEL,
            payload: { type: 'catalogue.changed', kind: 'pois', id: proposal.poi_id },
          });
        }
        return { status };
      },
    }),
  ];
}
