/**
 * `ai.disruption` (queued by a `flight.status_changed` delay, cancellation or diversion, and by a
 * missed connection): the flight's impact is worked out in code, classified under the autonomy
 * policy, worded by the guide (route `disruption.plan_b`, templates on any slip) and persisted as
 * one open disruption per segment. A re-trigger bumps its version and diffs rows: unchanged rows
 * keep their state, changed ones are taken back and re-run, and a flight back on time resolves it.
 * The guide's own fixes run through the guide-actions executor; everything else waits for a yes.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { DISRUPTION_QUEUES, flightDisruptionJobSchema, type FlightDisruptionJob } from '@cp/domain';
import { analyzeFlightImpact, classifyFlightActions, diffActions } from '@cp/planner';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { enqueueGuideTextTranslation } from '../i18n/enqueue';
import type { DisruptionWriter } from './copy';
import { advancePlan, startRows } from './execute-rows';
import { loadFlightFacts, type FlightFacts } from './flight-inputs';
import { retireRows } from './retrigger';
import { lockDisruption, saveActions } from './rows';

export type FlightDisruptionOutcome = 'no_change' | 'opened' | 'updated' | 'resolved' | 'unchanged';

/**
 * Closes the open disruption: back on time, what the guide did is taken back; landed, it simply
 * ends (the fixes stand).
 */
async function resolveOpen(
  tx: pg.PoolClient,
  disruptionId: string,
  facts: FlightFacts,
): Promise<FlightDisruptionOutcome> {
  const open = await lockDisruption(tx, disruptionId);
  if (open === undefined) return 'no_change';
  if (!facts.landed) {
    const retired = await retireRows(tx, open.actions, open.organiser_ids[0] ?? null);
    const rows = open.actions.map((row) => retired.moved.get(row.id) ?? row);
    await saveActions(tx, open, rows, [...retired.moved.values()]);
  }
  await tx.query(
    "UPDATE disruptions SET status = 'resolved', resolved_at = now(), version = version + 1 WHERE id = $1",
    [open.id],
  );
  await appendDomainEvent(tx, {
    type: 'disruption.resolved',
    aggregateKind: 'trip',
    aggregateId: facts.tripId,
    actorKind: 'system',
    actorId: null,
    crewId: facts.crewId,
    tripId: facts.tripId,
    payload: { trip_id: facts.tripId, disruption_id: open.id, status: 'resolved' },
  });
  return 'resolved';
}

export async function runFlightDisruption(
  pool: pg.Pool,
  job: FlightDisruptionJob,
  writer: DisruptionWriter,
  now: Date = new Date(),
): Promise<FlightDisruptionOutcome> {
  const read = await withSystem(pool, async (tx) => {
    const facts = await loadFlightFacts(tx, job.segment_id);
    if (facts === null) return null;
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM disruptions WHERE trip_id = $1 AND dedupe_key = $2 AND status = 'open'`,
      [facts.tripId, `flight:${job.segment_id}`],
    );
    return { facts, openId: rows[0]?.id ?? null };
  });
  if (read === null) return 'no_change';
  const { facts } = read;
  const impact = analyzeFlightImpact(facts.input);
  if (!impact.material || facts.landed) {
    if (read.openId === null) return 'no_change';
    const openId = read.openId;
    return withSystem(pool, (tx) => resolveOpen(tx, openId, facts));
  }
  const classified = classifyFlightActions(facts.input.change, impact, {
    now,
    inTrip: facts.inTrip,
  });
  const copy = await writer(facts, impact, classified);
  const rows = classified.map((row) => ({ ...row, label: copy.lines[row.id] ?? row.label }));

  return withSystem(pool, async (tx) => {
    const previous = read.openId === null ? undefined : await lockDisruption(tx, read.openId);
    const diff = diffActions(previous?.actions ?? [], rows);
    if (previous !== undefined && diff.fresh.length === 0 && diff.obsolete.length === 0) {
      return 'unchanged';
    }
    const affected = {
      traveller_ids: impact.travellerIds,
      item_stable_ids: impact.affected.map((entry) => entry.item.stableId),
      unaffected_ids: impact.unaffected.map((entry) => entry.userId),
    };
    const fields = [
      copy.headline,
      copy.detail,
      JSON.stringify(affected),
      JSON.stringify(impact.facts),
      JSON.stringify({
        segment_id: job.segment_id,
        cause: impact.cause,
        delay_min: impact.delayMin,
      }),
    ];
    let disruptionId: string;
    if (previous === undefined) {
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, ref_kind, ref_id, title, summary,
           affected, facts, source_snapshot)
         VALUES ($1, 'flight_delay', $2, $3, 'flight_segment', $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [facts.tripId, impact.cause, `flight:${job.segment_id}`, job.segment_id, ...fields],
      );
      disruptionId = inserted.rows[0]?.id as string;
    } else {
      disruptionId = previous.id;
      await tx.query(
        `UPDATE disruptions SET cause = $2, title = $3, summary = $4, affected = $5, facts = $6,
                source_snapshot = $7, version = version + 1
          WHERE id = $1`,
        [disruptionId, impact.cause, ...fields],
      );
    }
    // A vendor row asking a new time replaces the old ask: a message already with the vendor needs
    // no "back to" draft (the new one corrects it); an unanswered draft is still withdrawn.
    const replaced = new Set(diff.fresh.filter((row) => row.class === 'vendor').map((r) => r.id));
    const withVendor = new Set(['approved', 'sent', 'confirmed', 'declined', 'no_answer']);
    const retired = await retireRows(
      tx,
      diff.obsolete.filter((row) => !(replaced.has(row.id) && withVendor.has(row.state))),
      previous?.organiser_ids[0] ?? facts.organiserIds[0] ?? null,
    );
    const started = await startRows(tx, [...diff.fresh, ...retired.compensations], {
      disruptionId,
      tripId: facts.tripId,
      crewId: facts.crewId,
      travellerIds: impact.travellerIds,
      unaffectedIds: impact.unaffected.map((entry) => entry.userId),
      headline: copy.headline,
      now,
    });
    const startedIds = new Set(started.map((row) => row.id));
    const history = [...retired.moved.values()].filter((row) => !startedIds.has(row.id));
    const all = [...diff.kept, ...started, ...history];
    await saveActions(tx, { id: disruptionId, trip_id: facts.tripId }, all, started);
    const saved = await lockDisruption(tx, disruptionId);
    if (saved !== undefined) await advancePlan(tx, saved);
    const version = (previous?.version ?? 0) + 1;
    await appendDomainEvent(tx, {
      type: previous === undefined ? 'disruption.detected' : 'disruption.updated',
      aggregateKind: 'trip',
      aggregateId: facts.tripId,
      actorKind: 'guide',
      actorId: null,
      crewId: facts.crewId,
      tripId: facts.tripId,
      payload:
        previous === undefined
          ? {
              trip_id: facts.tripId,
              disruption_id: disruptionId,
              kind: 'flight_delay',
              cause: impact.cause,
              version,
              done: all.filter((row) => row.autonomous).length,
              needs_yes: all.filter((row) => row.poll !== null).length,
            }
          : { trip_id: facts.tripId, disruption_id: disruptionId, version },
    });
    await enqueueGuideTextTranslation(tx, { tripId: facts.tripId });
    return previous === undefined ? 'opened' : 'updated';
  });
}

export function flightDisruptionJob(writer: DisruptionWriter): JobDefinition<FlightDisruptionJob> {
  return defineJob({
    queue: DISRUPTION_QUEUES.flight,
    schema: flightDisruptionJobSchema,
    singletonKey: (data: FlightDisruptionJob) => data.segment_id,
    handler: async (data, ctx) => ({ outcome: await runFlightDisruption(ctx.pool, data, writer) }),
  });
}
