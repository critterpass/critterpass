/**
 * `copresence.evaluate`: a crew legendary found together. Every member who is on the trip (RSVP
 * in, or its organiser) and has arrived (egg hatched or leg landed) must be there: the rule's
 * `min_members` is only a floor. Each member's own encounter is verified like any other; this job
 * looks for an instant when at least that many verified dwells overlap by
 * `co_presence_overlap_s`, then grants every one of them in one transaction with one `found_at`
 * and announces them in one `reward.fanout`. `trip_copresence:{trip_id}` carries the count
 * ("3 of 6 here") and who is still missing — never where anyone is.
 */
import { appendDomainEvent, outbox, sendInTx, withSystem } from '@cp/db';
import {
  channelName,
  copresenceJobSchema,
  CRITTER_QUEUES,
  CRITTERS_RT,
  ENCOUNTER_CONFIG_KEY,
  resolveEncounterConfig,
  type CopresenceJob,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

interface Dwell {
  readonly user_id: string;
  readonly encounter_id: string;
  readonly from_ms: number;
  readonly to_ms: number;
}

/** The largest group of members all present for `overlapMs` from one shared instant. */
export function largestOverlap(dwells: readonly Dwell[], overlapMs: number): Dwell[] {
  let best: Dwell[] = [];
  for (const anchor of dwells) {
    const t = anchor.from_ms;
    const here = new Map<string, Dwell>();
    for (const dwell of dwells) {
      if (dwell.from_ms <= t && dwell.to_ms >= t + overlapMs && !here.has(dwell.user_id)) {
        here.set(dwell.user_id, dwell);
      }
    }
    if (here.size > best.length) best = [...here.values()];
  }
  return best;
}

async function eligibleMembers(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT p.user_id FROM trip_participants p
      WHERE p.trip_id = $1 AND (p.rsvp = 'in' OR (p.role = 'organiser' AND p.rsvp <> 'out'))
        AND (p.landed_at IS NOT NULL OR EXISTS (
          SELECT 1 FROM eggs e WHERE e.trip_id = p.trip_id AND e.user_id = p.user_id
            AND e.hatched_at IS NOT NULL))
      ORDER BY p.user_id`,
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

export async function evaluateCopresence(
  pool: pg.Pool,
  job: CopresenceJob,
  now: Date = new Date(),
): Promise<{ readonly here: number; readonly needed: number; readonly granted: number }> {
  return withSystem(pool, async (tx) => {
    const { rows: rules } = await tx.query<{ form_id: string; min_members: number }>(
      "SELECT form_id, min_members FROM spawn_rules WHERE id = $1 AND kind = 'co_presence'",
      [job.spawn_rule_id],
    );
    const rule = rules[0];
    if (rule === undefined) return { here: 0, needed: 0, granted: 0 };
    const config = resolveEncounterConfig(
      (
        await tx.query<{ value: unknown }>('SELECT value FROM client_config WHERE key = $1', [
          ENCOUNTER_CONFIG_KEY,
        ])
      ).rows[0]?.value,
    );
    const members = await eligibleMembers(tx, job.trip_id);
    const needed = Math.max(rule.min_members, members.length);
    const { rows: dwells } = await tx.query<Dwell>(
      `SELECT user_id, id AS encounter_id,
              (extract(epoch FROM greatest(started_at, resolved_at - make_interval(secs => dwell_s))) * 1000)::float8 AS from_ms,
              (extract(epoch FROM resolved_at) * 1000)::float8 AS to_ms
         FROM encounters
        WHERE trip_id = $1 AND spawn_rule_id = $2 AND verification = 'verified'
          AND user_id = ANY ($3::uuid[])`,
      [job.trip_id, job.spawn_rule_id, members],
    );
    const group = largestOverlap(dwells, config.co_presence_overlap_s * 1000);
    const present = new Set(group.map((dwell) => dwell.user_id));
    const channel = channelName('trip_copresence', job.trip_id);
    await outbox(tx, channel, CRITTERS_RT.copresence, {
      rule_id: job.spawn_rule_id,
      here: present.size,
      needed,
      missing: members.filter((uid) => !present.has(uid)),
    });
    if (group.length < needed) return { here: group.length, needed, granted: 0 };

    const entryIds: string[] = [];
    for (const dwell of [...group].sort((a, b) => (a.user_id < b.user_id ? -1 : 1))) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source,
           encounter_id, verification, critter_name, form_name)
         SELECT $1, f.id, f.critter_id, $3, $4, 'encounter', $5, 'verified',
                (SELECT cn.name FROM critter_names cn WHERE cn.critter_id = f.critter_id
                   AND cn.form_id IS NULL AND cn.locale = 'en' LIMIT 1),
                (SELECT cn.name FROM critter_names cn WHERE cn.form_id = f.id AND cn.locale = 'en' LIMIT 1)
           FROM critter_forms f WHERE f.id = $2
         ON CONFLICT (user_id, form_id) DO NOTHING
         RETURNING id`,
        [dwell.user_id, rule.form_id, now, job.trip_id, dwell.encounter_id],
      );
      if (rows[0] !== undefined) entryIds.push(rows[0].id);
    }
    if (entryIds.length === 0) return { here: group.length, needed, granted: 0 };
    await sendInTx(
      tx,
      CRITTER_QUEUES.rewardFanout,
      { kind: 'critter_found', entry_ids: entryIds, granted_at: now.toISOString() },
      { singletonKey: [...entryIds].sort().join(',') },
    );
    await appendDomainEvent(tx, {
      type: 'copresence.completed',
      aggregateKind: 'spawn_rule',
      aggregateId: job.spawn_rule_id,
      actorKind: 'system',
      actorId: null,
      tripId: job.trip_id,
      payload: {
        trip_id: job.trip_id,
        spawn_rule_id: job.spawn_rule_id,
        form_id: rule.form_id,
        user_ids: [...present].sort(),
      },
    });
    await outbox(tx, channel, CRITTERS_RT.copresenceCompleted, {
      rule_id: job.spawn_rule_id,
      form_id: rule.form_id,
    });
    return { here: group.length, needed, granted: entryIds.length };
  });
}

export function copresenceJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.copresence,
    schema: copresenceJobSchema,
    singletonKey: (data) => `${data.trip_id}:${data.spawn_rule_id}`,
    async handler(data, { pool }) {
      return evaluateCopresence(pool, data);
    },
  });
}
