/**
 * Starting a disruption's new rows, in the disruption job's transaction:
 * - plan rows run through the guide-actions executor one at a time (`advancePlan`); an autonomous
 *   row ticks `done` only when its change set is really applied (./react.ts);
 * - needs-a-yes rows (plan or vendor) get a decision poll for the affected members;
 * - vendor rows get a desk draft (never sent by us);
 * - the guide's own derived rows run here: leave-bys recompute, the briefing lines, the Live
 *   Activity (already refreshed by the flight event itself) and the "nothing changes" note.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import { generateUuidV7, TRIP_DAY_QUEUES, type DisruptionAction } from '@cp/domain';
import type pg from 'pg';

import { planGuideAction } from '../../guide-actions';
import { insertBriefingItem } from '../trip-day/briefing-insert-event';
import { moveRow, type DisruptionRow } from './rows';
import { openDecisionPoll } from './decision-poll';
import { createVendorDraft } from './vendor-drafts';

export interface RowContext {
  readonly disruptionId: string;
  readonly tripId: string;
  readonly crewId: string;
  readonly travellerIds: readonly string[];
  readonly unaffectedIds: readonly string[];
  readonly headline: string;
  readonly now: Date;
}

/**
 * Runs the disruption's next plan row through the executor, one at a time: every guide action is
 * a change set on the current plan version, so a second one planned before the first is applied
 * would be stale. A row runs when the guide may do it alone (`planned` and autonomous) or once the
 * crew said yes (`approved`); the next one starts when this one's change set is applied.
 */
export async function advancePlan(tx: pg.PoolClient, disruption: DisruptionRow): Promise<void> {
  if (disruption.guide_id === null) return;
  if (disruption.actions.some((row) => row.class === 'plan' && row.state === 'running')) return;
  const next = disruption.actions.find(
    (row) =>
      row.class === 'plan' &&
      row.item_stable_id !== null &&
      (row.starts_at !== null || row.kind === 'skip_item') &&
      ((row.state === 'planned' && row.autonomous) || row.state === 'approved'),
  );
  if (next?.item_stable_id == null) return;
  const shared = {
    target: next.item_stable_id,
    reason: next.label,
    affected_user_ids: next.affected_user_ids,
    booking_impact: next.booking_impact,
  };
  const planned = await planGuideAction(tx, {
    tripId: disruption.trip_id,
    // Sitting an item out takes it off the plan; every other plan row moves its item's start.
    kind: next.kind === 'skip_item' ? 'remove_item' : next.kind,
    ops:
      next.starts_at === null
        ? [{ op: 'remove', ...shared }]
        : [{ op: 'retime', ...shared, after: { starts_at: next.starts_at } }],
    guideId: disruption.guide_id,
    requesterId: null,
    trigger: 'delay',
    timeCritical: true,
    disruptionId: disruption.id,
  });
  await moveRow(tx, disruption, (row) => row.id === next.id, 'running', {
    guide_action_id: planned.actionId,
  });
}

async function askCrew(
  tx: pg.PoolClient,
  row: DisruptionAction,
  ctx: RowContext,
): Promise<DisruptionAction> {
  if (row.decider === null || row.poll !== null) return row;
  const poll = await openDecisionPoll(tx, {
    crewId: ctx.crewId,
    tripId: ctx.tripId,
    question: row.label,
    voterIds: row.affected_user_ids,
    decider: row.decider,
    now: ctx.now,
  });
  await appendDomainEvent(tx, {
    type: 'disruption.needs_yes',
    aggregateKind: 'trip',
    aggregateId: ctx.tripId,
    actorKind: 'guide',
    actorId: null,
    crewId: ctx.crewId,
    tripId: ctx.tripId,
    payload: {
      trip_id: ctx.tripId,
      disruption_id: ctx.disruptionId,
      action_id: poll.id,
      affected: row.affected_user_ids.length,
    },
  });
  return { ...row, poll };
}

async function runSystemRow(
  tx: pg.PoolClient,
  row: DisruptionAction,
  ctx: RowContext,
): Promise<DisruptionAction> {
  switch (row.kind) {
    case 'recompute_leave_by':
      await sendInTx(
        tx,
        TRIP_DAY_QUEUES.leaveByRecompute,
        { trip_id: ctx.tripId },
        { singletonKey: ctx.tripId },
      );
      break;
    case 'insert_briefing':
      if (ctx.travellerIds.length > 0) {
        await insertBriefingItem(
          tx,
          {
            trip_id: ctx.tripId,
            user_ids: ctx.travellerIds.slice(0, 32),
            source_event_id: ctx.disruptionId,
            icon: 'plane',
            text: ctx.headline.slice(0, 120),
            action: 'open',
            deep_link: `/trip/${ctx.tripId}/disruption/${ctx.disruptionId}`,
          },
          ctx.now,
        );
      }
      break;
    case 'notify_unaffected':
      if (ctx.unaffectedIds.length > 0) {
        await insertBriefingItem(
          tx,
          {
            trip_id: ctx.tripId,
            user_ids: ctx.unaffectedIds.slice(0, 32),
            source_event_id: generateUuidV7(),
            icon: 'plane',
            text: row.label.slice(0, 120),
            action: 'open',
            deep_link: `/trip/${ctx.tripId}/disruption/${ctx.disruptionId}`,
          },
          ctx.now,
        );
      }
      break;
    case 'refresh_live_activity':
      // The flight event itself already refreshed the Live Activity.
      break;
    case 'retime_item':
    case 'reschedule_pickup':
    case 'skip_item':
    case 'contact_vendor':
    case 'rebook_flight':
      return row;
  }
  return { ...row, state: 'done' };
}

/** The message itself, to the vendor, from the row's facts (the crew sees and approves it). */
export function vendorBody(row: DisruptionAction, vendor: string): string {
  const from = String(row.facts['from'] ?? '');
  const to = row.facts['to'];
  const title = String(row.facts['title'] ?? 'our booking');
  const why = row.facts['why'];
  if (why === 'late_push' || why === 'late_join' || why === 'late_skip') {
    const late = `${String(row.facts['names'] ?? 'We')} will be about ${String(row.facts['minutes'] ?? '')} min late for ${title} at ${from}`;
    if (why === 'late_skip') {
      return `Hi ${vendor}, we are stuck on the way and can't make ${title} at ${from} today. Sorry for the short notice.`;
    }
    return why === 'late_join'
      ? `Hi ${vendor}, ${late}. The others will start on time; is it all right to join at ${String(to)}?`
      : `Hi ${vendor}, ${late}. Could we start at ${String(to)} instead?`;
  }
  if (to === undefined) {
    return `Hi ${vendor}, our flight was cancelled and will not land today. Please don't wait for us at ${from}. We will be in touch with the new time.`;
  }
  return row.facts['role'] === 'pickup'
    ? `Hi ${vendor}, our flight is late. Could you pick us up at ${String(to)} instead of ${from}?`
    : `Hi ${vendor}, our flight is late. Could we move ${title} from ${from} to ${String(to)}?`;
}

export async function startRows(
  tx: pg.PoolClient,
  rows: readonly DisruptionAction[],
  ctx: RowContext,
): Promise<DisruptionAction[]> {
  const started: DisruptionAction[] = [];
  for (const original of rows) {
    let row = original;
    if (row.class === 'vendor' && row.state === 'draft_ready' && row.vendor_message_id === null) {
      const vendor = row.facts['vendor'];
      const lead = ctx.travellerIds[0];
      if (row.provider_id !== null && typeof vendor === 'string' && lead !== undefined) {
        const draft = await createVendorDraft(tx, {
          tripId: ctx.tripId,
          crewId: ctx.crewId,
          requestedBy: lead,
          providerId: row.provider_id,
          vendorName: vendor,
          body: vendorBody(row, vendor),
        });
        row = { ...row, vendor_message_id: draft.messageId };
      }
    }
    if (row.state === 'needs_yes' || row.state === 'draft_ready') row = await askCrew(tx, row, ctx);
    if (row.class === 'system' && row.state === 'planned') row = await runSystemRow(tx, row, ctx);
    started.push(row);
  }
  return started;
}
