/**
 * `record_visit` (docs/api-contracts.md §4.13): stores one POI-level visit — a POI and two
 * instants, never coordinates — for the caller on a trip they are on. Detected (`geofence`) visits
 * need the caller's live `visit_detection` consent and evidence that passes plausibility: no
 * software-simulated or implausible fixes (an external GPS accessory is fine), a real dwell and a
 * usable accuracy. Expense and manual visits are explicit user actions and carry no evidence.
 *
 * The visit id is the client's, so an arrival recorded early and closed later (same id, now with
 * `left_at`) is one row; a replayed op is a no-op through the op log.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DEFAULT_VISIT_PARAMS,
  DomainError,
  recordVisitPayloadSchema,
  rejectsEvidence,
  type RecordVisitPayload,
  type RecordVisitResult,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';

/** Shortest dwell a detected visit may claim, whatever the category's own (longer) default. */
export const MIN_DETECTED_DWELL_S = 60;
/** Clock skew tolerated on `arrived_at` / `left_at` before a visit reads as "in the future". */
const FUTURE_SKEW_MS = 5 * 60_000;

async function hasVisitConsent(tx: pg.PoolClient, uid: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM consents WHERE user_id = $1 AND purpose = 'visit_detection'
         AND granted_at IS NOT NULL AND revoked_at IS NULL) AS ok`,
    [uid],
  );
  return rows[0]?.ok === true;
}

function checkEvidence(payload: RecordVisitPayload, now: Date): void {
  const latest = now.getTime() + FUTURE_SKEW_MS;
  const arrived = Date.parse(payload.arrived_at);
  if (arrived > latest || (payload.left_at !== undefined && Date.parse(payload.left_at) > latest)) {
    throw new DomainError('VALIDATION', { reason: 'visit_in_future' });
  }
  const evidence = payload.evidence;
  if (payload.source !== 'geofence' || evidence === undefined) return;
  if (rejectsEvidence(evidence.mock_flags)) {
    throw new DomainError('LOCATION_IMPLAUSIBLE', { reason: 'mock_flags' });
  }
  if (evidence.dwell_s < MIN_DETECTED_DWELL_S) {
    throw new DomainError('LOCATION_IMPLAUSIBLE', { reason: 'dwell_too_short' });
  }
  if (evidence.acc > DEFAULT_VISIT_PARAMS.maxAccuracyM) {
    throw new DomainError('LOCATION_IMPLAUSIBLE', { reason: 'accuracy' });
  }
  if (payload.left_at !== undefined) {
    const spanS = (Date.parse(payload.left_at) - arrived) / 1000;
    if (evidence.dwell_s > spanS + 60) {
      throw new DomainError('LOCATION_IMPLAUSIBLE', { reason: 'dwell_exceeds_visit' });
    }
  }
}

export const recordVisitCommand = defineCommand({
  name: 'record_visit',
  v: 1,
  schema: recordVisitPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ on_trip: boolean; same_destination: boolean | null }>(
      `SELECT
         app.is_trip_member($1) AND EXISTS (
           SELECT 1 FROM trip_participants
           WHERE trip_id = $1 AND user_id = $3 AND (rsvp <> 'out' OR role = 'organiser')
         ) AS on_trip,
         (SELECT t.destination_id = p.destination_id FROM trips t, pois p
          WHERE t.id = $1 AND p.id = $2) AS same_destination`,
      [payload.trip_id, payload.poi_id, ctx.uid],
    );
    const row = rows[0];
    if (row?.on_trip !== true) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_trip' });
    if (row.same_destination === null) throw new DomainError('NOT_FOUND', { reason: 'poi' });
    if (!row.same_destination) {
      throw new DomainError('VALIDATION', { reason: 'poi_not_in_trip_destination' });
    }
    if (payload.source === 'geofence' && !(await hasVisitConsent(tx, ctx.uid))) {
      throw new DomainError('FORBIDDEN', {
        reason: 'consent_required',
        purpose: 'visit_detection',
      });
    }
    checkEvidence(payload, ctx.clock.serverNow);
  },
  handle: async (tx, payload, ctx): Promise<RecordVisitResult> => {
    const existing = await tx.query<{ trip_id: string }>(
      'SELECT trip_id FROM visits WHERE id = $1',
      [payload.visit_id],
    );
    if (existing.rows[0] !== undefined) {
      if (existing.rows[0].trip_id !== payload.trip_id) {
        throw new DomainError('VALIDATION', { reason: 'visit_id_taken' });
      }
      if (payload.left_at !== undefined) {
        await tx.query('UPDATE visits SET left_at = $2 WHERE id = $1 AND left_at IS NULL', [
          payload.visit_id,
          payload.left_at,
        ]);
      }
      return { visit_id: payload.visit_id };
    }

    const inserted = await tx.query(
      `INSERT INTO visits (id, user_id, trip_id, poi_id, source, arrived_at, left_at, detection_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        payload.visit_id,
        ctx.uid,
        payload.trip_id,
        payload.poi_id,
        payload.source,
        payload.arrived_at,
        payload.left_at ?? null,
        payload.evidence?.detection_version ?? 1,
      ],
    );
    // Another user's row holds this id (hidden by RLS): never reveal it, never overwrite it.
    if (inserted.rowCount === 0) throw new DomainError('VALIDATION', { reason: 'visit_id_taken' });

    await appendDomainEvent(tx, {
      type: 'visit.recorded',
      aggregateKind: 'visit',
      aggregateId: payload.visit_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: { visit_id: payload.visit_id, trip_id: payload.trip_id, source: payload.source },
    });
    return { visit_id: payload.visit_id };
  },
});
