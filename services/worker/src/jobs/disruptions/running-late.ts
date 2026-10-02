/**
 * Running late, the worker's half (3k-9):
 * - `late_option.chosen`: the pick becomes rows under the autonomy policy (./late-choice in the
 *   planner). Rows from an earlier pick that still wait are withdrawn first (their draft and their
 *   vote with them), so a changed mind never leaves two answers open. A retime runs through the
 *   guide-actions executor like any other; a message to whoever runs the item is a desk draft.
 * - the push (`running_late_detected`): the late ones are told they can choose what to do, and,
 *   when the ETA said so, whoever waits for them is told who is late and by how much. A member who
 *   reported it themselves already pinged the crew, so only the late ones hear from the guide.
 */
import {
  DISRUPTION_PUSH,
  lateOptionsSchema,
  registerNotificationTrigger,
  type DisruptionAction,
} from '@cp/domain';
import { lateChoiceRows } from '@cp/planner';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';
import { advancePlan, startRows } from './execute-rows';
import { loadLateWorld } from './late-options';
import type { ReactEvent } from './react';
import { lockDisruption, saveActions } from './rows';
import { withdrawVendorDraft } from './vendor-drafts';

const WAITING: ReadonlySet<string> = new Set([
  'planned',
  'needs_yes',
  'approved',
  'draft_ready',
  'waiting_vendor',
]);

/** Takes back a row nobody acted on yet: its draft is superseded and its vote cancelled. */
async function withdraw(tx: pg.PoolClient, row: DisruptionAction): Promise<DisruptionAction> {
  if (!WAITING.has(row.state)) return row;
  if (row.vendor_message_id !== null) await withdrawVendorDraft(tx, row.vendor_message_id);
  if (row.poll !== null) {
    await tx.query(
      "UPDATE polls SET status = 'cancelled', version = version + 1 WHERE id = $1 AND status = 'open'",
      [row.poll.id],
    );
  }
  return { ...row, state: 'withdrawn' };
}

export async function applyLateChoice(
  tx: pg.PoolClient,
  event: ReactEvent,
  now: Date,
): Promise<number> {
  const disruptionId = event.payload['disruption_id'];
  if (typeof disruptionId !== 'string' || event.actorId === null) return 0;
  const world = await loadLateWorld(tx, disruptionId, now);
  const disruption = await lockDisruption(tx, disruptionId);
  if (world === undefined || disruption === undefined || !world.open) return 0;
  // The pick is read from the row, not the event: a later pick may already have replaced it. The
  // option is the stored one, with the times the member saw when they picked it.
  const stored = lateOptionsSchema.safeParse(disruption.options);
  const option = stored.data?.find((o) => o.id === world.chosenOptionId);
  if (option === undefined) return 0;
  const fresh = lateChoiceRows(world.input, option, {
    now,
    inTrip: world.inTrip,
    chooserId: event.actorId,
    itemStableId: world.itemStableId,
    providerId: world.providerId,
    locked: world.locked,
    names: world.names,
  });
  const freshIds = new Set(fresh.map((row) => row.id));
  const kept: DisruptionAction[] = [];
  const changed: DisruptionAction[] = [];
  for (const row of disruption.actions) {
    const after = await withdraw(tx, row);
    if (after !== row) changed.push(after);
    // A withdrawn row the new pick asks for again is replaced by the new one.
    if (!(after.state === 'withdrawn' && freshIds.has(after.id))) kept.push(after);
  }
  const started = await startRows(tx, fresh, {
    disruptionId,
    tripId: world.tripId,
    crewId: world.crewId,
    travellerIds: world.input.latePartyIds,
    unaffectedIds: world.input.waitingIds,
    headline: disruption.title,
    now,
  });
  const keptIds = new Set(kept.map((row) => row.id));
  const actions = [...kept, ...started.filter((row) => !keptIds.has(row.id))];
  await saveActions(tx, disruption, actions, [...changed, ...started]);
  disruption.actions.splice(0, disruption.actions.length, ...actions);
  await advancePlan(tx, disruption);
  return started.length + changed.length;
}

interface LatePush {
  readonly crew_id: string;
  readonly cause: string;
  readonly place: string;
  readonly late_min: number;
  readonly party: string[];
  readonly waiting: string[];
  readonly names: string[];
}

async function latePush(tx: pg.PoolClient, routed: RoutedEvent): Promise<LatePush | undefined> {
  const { rows } = await tx.query<LatePush>(
    `SELECT t.crew_id, d.cause, coalesce(d.facts ->> 'title', '') AS place,
            coalesce((d.facts ->> 'late_min')::int, 0) AS late_min,
            ARRAY(SELECT jsonb_array_elements_text(d.affected -> 'traveller_ids')) AS party,
            ARRAY(SELECT jsonb_array_elements_text(d.affected -> 'unaffected_ids')) AS waiting,
            ARRAY(SELECT coalesce(nullif(u.display_name, ''), 'Someone')
                    FROM jsonb_array_elements_text(d.affected -> 'traveller_ids')
                         WITH ORDINALITY AS late(uid, position)
                    JOIN users u ON u.id = late.uid::uuid
                   ORDER BY late.position) AS names
       FROM disruptions d JOIN trips t ON t.id = d.trip_id
      WHERE d.id = $1 AND d.status = 'open'`,
    [str(routed, 'disruption_id')],
  );
  return rows[0];
}

let registered = false;

export function registerLateNotifications(): void {
  if (registered) return;
  registered = true;
  registerNotificationTrigger('running_late.detected', 'running_late_detected');
  registerNotification({
    key: 'running_late_detected',
    event: 'running_late.detected',
    audience: async (tx, routed) => {
      const late = await latePush(tx, routed);
      if (late === undefined) return [];
      return late.cause === 'manual' ? late.party : [...late.party, ...late.waiting];
    },
    async compose(tx, routed, uid) {
      const late = await latePush(tx, routed);
      if (late === undefined) return null;
      const tripId = str(routed, 'trip_id') ?? '';
      const disruptionId = str(routed, 'disruption_id') ?? '';
      return {
        title: DISRUPTION_PUSH.lateTitle,
        body: late.party.includes(uid)
          ? DISRUPTION_PUSH.lateBodyYou
          : DISRUPTION_PUSH.lateBodyWaiting,
        vars: {
          place: late.place,
          minutes: late.late_min,
          names: late.names.join(', '),
          count: late.names.length,
        },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: late.crew_id,
        tripId,
        deepLink: `/trip/${tripId}/late/${disruptionId}`,
        collapseVars: { plan_item_id: str(routed, 'plan_item_id') ?? '' },
      };
    },
    // Once per member per disruption: a refreshed ETA re-works the options, not the push.
    dedupeKey: (routed, uid) => `late:${str(routed, 'disruption_id') ?? ''}:${uid}`,
  });
}
