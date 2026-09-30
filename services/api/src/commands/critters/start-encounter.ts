/**
 * `start_encounter`: the device entered an eligible spawn. The row id is the client's, so a replay
 * or a late offline upload lands on the same row. One active encounter at a time: starting a new
 * one abandons whatever was still accruing. No coordinate is sent or stored — the spot is a POI of
 * the rule (or none, for a geofence-only spawn). Away from a trip, only the traveller's home set
 * spawns, and only with Explore at home on.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, startEncounterPayloadSchema, type StartEncounterPayload } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireTripSeat } from './shared';

interface RuleRow {
  readonly form_id: string;
  readonly poi_ids: string[];
  readonly has_geofences: boolean;
  readonly destination_id: string | null;
  readonly set_country: string;
}

async function liveRule(tx: pg.PoolClient, id: string): Promise<RuleRow> {
  const { rows } = await tx.query<RuleRow>(
    `SELECT r.form_id, r.poi_ids, jsonb_array_length(r.geofences) > 0 AS has_geofences,
            r.destination_id, s.country AS set_country
       FROM spawn_rules r JOIN critter_sets s ON s.id = r.set_id
      WHERE r.id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'spawn_rule' });
  return row;
}

async function requireHomeOptIn(tx: pg.PoolClient, uid: string, setCountry: string): Promise<void> {
  const { rows } = await tx.query<{ home: string | null; opted: boolean | null }>(
    `SELECT u.home_country AS home, s.explore_at_home AS opted
       FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = $1`,
    [uid],
  );
  const row = rows[0];
  if (
    row?.home === null ||
    row === undefined ||
    row.home.toUpperCase() !== setCountry.toUpperCase()
  ) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'not_home_set' });
  }
  if (row.opted !== true) throw new DomainError('NOT_ELIGIBLE', { reason: 'explore_at_home_off' });
}

export const startEncounterCommand = defineCommand({
  name: 'start_encounter',
  v: 1,
  schema: startEncounterPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: StartEncounterPayload, ctx) => {
    const rule = await liveRule(tx, payload.spawn_rule_id);
    if (payload.trip_id === null) {
      await requireHomeOptIn(tx, ctx.uid, rule.set_country);
    } else {
      const seat = await requireTripSeat(tx, payload.trip_id, ctx.uid);
      if (seat.status !== 'pre_trip' && seat.status !== 'in_trip') {
        throw new DomainError('STATE_INVALID', { reason: 'trip_not_travelling' });
      }
      if (rule.destination_id !== null && rule.destination_id !== seat.destination_id) {
        throw new DomainError('VALIDATION', { reason: 'spawn_not_in_trip_destination' });
      }
    }
    if (payload.poi_id === null ? !rule.has_geofences : !rule.poi_ids.includes(payload.poi_id)) {
      throw new DomainError('VALIDATION', { reason: 'spot_not_in_rule' });
    }
    if (Date.parse(payload.started_at) > ctx.clock.serverNow.getTime() + 5 * 60_000) {
      throw new DomainError('VALIDATION', { reason: 'started_in_future' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const existing = await tx.query('SELECT 1 FROM encounters WHERE id = $1', [
      payload.encounter_id,
    ]);
    if ((existing.rowCount ?? 0) > 0) return { encounter_id: payload.encounter_id, started: false };
    const rule = await liveRule(tx, payload.spawn_rule_id);
    await asSystemRole(tx, () =>
      tx.query(
        `UPDATE encounters SET state = 'abandoned', resolved_at = $2
          WHERE user_id = $1 AND state IN ('accruing', 'ready')`,
        [ctx.uid, ctx.clock.serverNow],
      ),
    );
    const inserted = await tx.query(
      `INSERT INTO encounters (id, user_id, trip_id, spawn_rule_id, form_id, poi_id, offline, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
      [
        payload.encounter_id,
        ctx.uid,
        payload.trip_id,
        payload.spawn_rule_id,
        rule.form_id,
        payload.poi_id,
        payload.offline,
        payload.started_at,
      ],
    );
    // Another user's row holds this id (hidden by RLS): never reveal it, never overwrite it.
    if (inserted.rowCount === 0)
      throw new DomainError('VALIDATION', { reason: 'encounter_id_taken' });
    if (payload.trip_id !== null) {
      await appendDomainEvent(tx, {
        type: 'encounter.started',
        aggregateKind: 'encounter',
        aggregateId: payload.encounter_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: {
          trip_id: payload.trip_id,
          user_id: ctx.uid,
          encounter_id: payload.encounter_id,
          spawn_rule_id: payload.spawn_rule_id,
        },
      });
    }
    return { encounter_id: payload.encounter_id, started: true };
  },
});
