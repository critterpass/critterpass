/**
 * The critter-nearby loader: a dwell that began while the app was in the background (where the
 * phone may not start an activity itself) goes on that traveller's lock screen by push-to-start,
 * and the ring then follows the dwell the server can confirm from the reported samples. The app in
 * front starts its own activity (under the spawn's id), so the server waits a moment for that
 * report and never starts a second one beside it. A catch ends it on the found art; wandering off,
 * walking away or a phone gone silent ends it sooner. The frames carry a distance band and the
 * spot's name, never a position; a spawn that only counts with the app open never gets one.
 */
import {
  buildCritterLaAttributes,
  buildCritterLaState,
  ENCOUNTER_CONFIG_KEY,
  LA_COPY,
  resolveEncounterConfig,
  type CritterLaInput,
} from '@cp/domain';
import type pg from 'pg';

import { confirmedDwell, type DwellSample } from './critter-dwell';
import { ROUTINE, type LaLoader } from './snapshot';

/** How long the app has to report the activity it started itself before the server starts one. */
export const CRITTER_START_GRACE_MS = 20_000;
/** No sample for this long: the phone stopped watching, so the critter is gone. */
export const CRITTER_SILENT_MS = 15 * 60_000;
const FOUND_LINGER_MS = 5 * 60_000;
const GONE_LINGER_MS = 60_000;

interface EncounterRow {
  id: string;
  user_id: string;
  trip_id: string | null;
  spawn_rule_id: string;
  form_id: string;
  state: 'accruing' | 'ready' | 'befriended' | 'wandered_off' | 'abandoned';
  created_at: Date;
  dwell_target_s: number;
  foreground_only: boolean;
  place_name: string | null;
  /** The app already shows this spawn's activity on one of the traveller's phones. */
  shown_by_app: boolean;
}

export async function loadEncounter(
  tx: pg.PoolClient,
  encounterId: string,
): Promise<EncounterRow | null> {
  const { rows } = await tx.query<EncounterRow>(
    `SELECT e.id, e.user_id, e.trip_id, e.spawn_rule_id, e.form_id, e.state, e.created_at,
            r.dwell_s AS dwell_target_s, r.foreground_only, p.name AS place_name,
            EXISTS (SELECT 1 FROM device_activities a
                     WHERE a.user_id = e.user_id AND a.kind = 'critter_nearby'
                       AND a.ref_id = e.spawn_rule_id
                       AND a.state IN ('pending', 'active', 'stale')) AS shown_by_app
       FROM encounters e
       JOIN spawn_rules r ON r.id = e.spawn_rule_id
       LEFT JOIN pois p ON p.id = e.poi_id
      WHERE e.id = $1`,
    [encounterId],
  );
  return rows[0] ?? null;
}

function laState(row: EncounterRow, phase: string, silent: boolean): CritterLaInput['state'] {
  if (row.state === 'befriended') return 'caught';
  if (row.state !== 'accruing' && row.state !== 'ready') return 'expired';
  if (phase === 'wandered_off' || silent) return 'expired';
  return phase === 'draining' ? 'draining' : 'dwelling';
}

export const critterLoader: LaLoader = async ({ tx, refId, now, redact }) => {
  const row = await loadEncounter(tx, refId);
  if (row === null || row.foreground_only) return null;
  const samples = await tx.query<DwellSample>(
    `SELECT at, distance_band, accuracy_m FROM encounter_samples
      WHERE encounter_id = $1 ORDER BY at`,
    [row.id],
  );
  const config = resolveEncounterConfig(
    (
      await tx.query<{ value: unknown }>('SELECT value FROM client_config WHERE key = $1', [
        ENCOUNTER_CONFIG_KEY,
      ])
    ).rows[0]?.value,
  );
  const dwell = confirmedDwell(samples.rows, row.dwell_target_s, now, config);
  const heardAt = Math.max(dwell.lastSampleAt?.getTime() ?? 0, row.created_at.getTime());
  const state = laState(row, dwell.phase, now.getTime() - heardAt >= CRITTER_SILENT_MS);
  const placeName = redact === true ? null : row.place_name;
  const input: CritterLaInput = {
    // The activity's object is this traveller's own encounter: two crewmates dwelling at one
    // spawn each have their own ring.
    spawnId: row.id,
    silhouetteKey: row.form_id,
    placeName,
    dwellTargetS: row.dwell_target_s,
    state,
    distanceBand: dwell.band,
    dwellFraction: state === 'caught' || row.state === 'ready' ? 1 : dwell.fraction,
    foundKey: state === 'caught' ? row.form_id : null,
  };
  const waiting = now.getTime() - row.created_at.getTime() < CRITTER_START_GRACE_MS;
  return {
    tripId: row.trip_id,
    live: state === 'dwelling' || state === 'draining',
    audience: [row.user_id],
    startAudience: waiting || row.shown_by_app ? [] : [row.user_id],
    attributes: () => Promise.resolve(buildCritterLaAttributes(input)),
    state: (seq) => buildCritterLaState(input, seq),
    startAlert:
      placeName === null
        ? { title: LA_COPY.critterStartTitle, body: LA_COPY.critterStartBodyPlain, vars: {} }
        : {
            title: LA_COPY.critterStartTitle,
            body: LA_COPY.critterStartBody,
            vars: { place: placeName },
          },
    endsAt: null,
    lingerMs: state === 'caught' ? FOUND_LINGER_MS : GONE_LINGER_MS,
    urgency: () => ROUTINE,
  };
};
