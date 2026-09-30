/**
 * Review changes (3e-3) as data: one card per change (what it was, struck; what it becomes; why;
 * who it touches; kept or dropped), the yeses sending it will need under the default decider
 * policy (the same autonomy rule the server applies), the vote's tally, and the state a chat card
 * shows for it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and keys, never copy. */
import { decideAutonomy, type ChangeSetOp } from '@cp/domain';

import { localTime, type PlanDay, type PlanItem } from '../../overview/model/plan-model';

export interface ChangeSide {
  /** Weekday (only when the change moves the item to another day), start time and label. */
  readonly dayNo: number | null;
  readonly time: string | null;
  readonly label: string;
}

export interface ChangeCard {
  readonly target: string;
  readonly op: ChangeSetOp['op'];
  readonly before: ChangeSide | null;
  readonly after: ChangeSide | null;
  readonly movesDay: boolean;
  readonly reason: string;
  readonly people: readonly string[];
  readonly accepted: boolean;
  readonly bookingImpact: boolean;
  readonly mustDo: boolean;
}

function side(
  snapshot: ChangeSetOp['before'],
  item: PlanItem | undefined,
  poiNames: ReadonlyMap<string, string>,
  tz: string | null,
): ChangeSide | null {
  if (snapshot === null || snapshot === undefined) {
    if (item === undefined) return null;
    return {
      dayNo: item.dayNo,
      time: localTime(item.startsAt, item.tz ?? tz),
      label: item.label ?? '',
    };
  }
  const poi = snapshot.poi_id ?? item?.poiId ?? null;
  const label =
    (poi === null ? undefined : poiNames.get(poi)) ??
    (snapshot.poi_id === undefined ? item?.label : undefined) ??
    snapshot.notes ??
    item?.label ??
    snapshot.category ??
    '';
  return {
    dayNo: snapshot.day_no ?? item?.dayNo ?? null,
    time: localTime(snapshot.starts_at ?? item?.startsAt ?? null, snapshot.tz ?? item?.tz ?? tz),
    label,
  };
}

export function buildChangeCards(
  ops: readonly ChangeSetOp[],
  baseItems: readonly PlanItem[],
  poiNames: ReadonlyMap<string, string>,
  tz: string | null,
): ChangeCard[] {
  const byId = new Map(baseItems.map((item) => [item.stableId, item]));
  return ops.map((op) => {
    const item = byId.get(op.target);
    const before = op.op === 'add' ? null : side(op.before, item, poiNames, tz);
    const merged = op.op === 'remove' ? null : side(op.after ?? null, item, poiNames, tz);
    // `after` carries only what changes: the rest reads from the item as it was.
    const after =
      merged === null
        ? null
        : {
            dayNo: op.after?.day_no ?? before?.dayNo ?? merged.dayNo,
            time: op.after?.starts_at === undefined ? (before?.time ?? merged.time) : merged.time,
            label:
              op.after?.poi_id === undefined && op.after?.notes === undefined && before !== null
                ? before.label
                : merged.label,
          };
    const people =
      op.affected_user_ids.length > 0 ? op.affected_user_ids : (item?.attendeeIds ?? []);
    return {
      target: op.target,
      op: op.op,
      before,
      after,
      movesDay: before !== null && after !== null && before.dayNo !== after.dayNo,
      reason: op.reason,
      people,
      accepted: op.accepted !== false,
      bookingImpact: op.booking_impact,
      mustDo: (item?.mustDoId ?? null) !== null || (op.after?.must_do_id ?? null) !== null,
    };
  });
}

/** `{Weekday} {time} {label}` with the parts a side has; the weekday only when the day moves. */
export function sideText(
  change: ChangeSide,
  days: readonly PlanDay[],
  withDay: boolean,
  weekdayOf: (date: string | null) => string,
): string {
  const date = days.find((day) => day.dayNo === change.dayNo)?.date ?? null;
  return [withDay ? weekdayOf(date) : '', change.time ?? '', change.label]
    .filter((part) => part !== '')
    .join(' ');
}

export type DeciderPrediction =
  | { readonly kind: 'self' }
  | { readonly kind: 'vote'; readonly needed: number; readonly affected: readonly string[] };

/**
 * The yeses sending will need: who the accepted changes touch (their own lists, plus everyone on
 * each touched item before and after; an item nobody is named on touches the whole crew), run
 * through the guide's autonomy rule as the server's default policy does.
 */
export function predictDecider(input: {
  readonly ops: readonly ChangeSetOp[];
  readonly baseItems: readonly PlanItem[];
  readonly crew: readonly string[];
  readonly authorId: string;
  readonly costDeltaMinor: number;
  readonly inTrip: boolean;
  readonly now: Date;
}): DeciderPrediction {
  const byId = new Map(input.baseItems.map((item) => [item.stableId, item]));
  const affected = new Set<string>();
  const attend = (ids: readonly string[] | undefined) =>
    (ids === undefined || ids.length === 0 ? input.crew : ids).forEach((uid) => affected.add(uid));
  const accepted = input.ops.filter((op) => op.accepted !== false);
  for (const op of accepted) {
    op.affected_user_ids.forEach((uid) => affected.add(uid));
    if (op.op !== 'add') attend(byId.get(op.target)?.attendeeIds);
    if (op.op === 'add' || op.after?.attendee_ids !== undefined) attend(op.after?.attendee_ids);
  }
  const crew = new Set(input.crew);
  const people = [...affected].filter((uid) => crew.has(uid)).sort();
  const starts = accepted.flatMap((op) =>
    [op.before?.starts_at, op.after?.starts_at].filter((at): at is string => at !== undefined),
  );
  const decision = decideAutonomy(
    {
      kind: 'move_item',
      reversible: true,
      costDeltaMinor: input.costDeltaMinor,
      bookingImpact: accepted.some((op) => op.booking_impact),
      affectedUserIds: people,
      requesterId: input.authorId,
      timeCritical: input.inTrip && starts.some((at) => Date.parse(at) > input.now.getTime()),
    },
    { now: input.now, inTrip: input.inTrip },
  );
  if (decision.outcome !== 'needs_yes' || decision.decider_policy === 'self')
    return { kind: 'self' };
  return { kind: 'vote', needed: decision.threshold, affected: people };
}

export interface Tally {
  readonly yes: readonly string[];
  readonly no: readonly string[];
  readonly needed: number;
  readonly eligible: readonly string[];
}

export function yesNeeded(
  policy: string | null,
  eligible: number,
  threshold: number | null,
): number {
  switch (policy ?? '') {
    case 'organiser':
    case 'any_affected':
      return 1;
    case 'majority_of_affected':
      return Math.floor(eligible / 2) + 1;
    case 'threshold_n':
      return Math.max(1, Math.min(threshold ?? 1, eligible));
    default:
      return 0;
  }
}

/** Ballots on the approval poll: option position 0 is yes, 1 is no. */
export function tallyOf(
  ballots: readonly { readonly user_id: string; readonly position: number }[],
  poll: { readonly decider_policy: string | null; readonly threshold: number | null },
  eligible: readonly string[],
): Tally {
  return {
    yes: ballots.filter((b) => Number(b.position) === 0).map((b) => b.user_id),
    no: ballots.filter((b) => Number(b.position) === 1).map((b) => b.user_id),
    needed: yesNeeded(poll.decider_policy, eligible.length, poll.threshold),
    eligible,
  };
}

export type ChangesetState =
  'draft' | 'voting' | 'approved' | 'rejected' | 'expired' | 'stale' | 'applying';

/** What a card says about a change set: its own status, with an unanswered closed vote expired. */
export function changesetState(
  status: string,
  poll: { readonly status: string; readonly close_reason: string | null } | null,
): ChangesetState {
  switch (status) {
    case 'draft':
    case 'proposed':
      return 'draft';
    case 'voting':
      return poll?.status === 'closed' && poll.close_reason === 'deadline' ? 'expired' : 'voting';
    case 'approved':
      return 'applying';
    case 'applied':
      return 'approved';
    case 'stale':
      return 'stale';
    case 'rejected':
    case 'reverted':
      return poll?.close_reason === 'deadline' ? 'expired' : 'rejected';
    default:
      return 'draft';
  }
}

/** Ops with my queued toggles laid over them. */
export function withToggles(
  ops: readonly ChangeSetOp[],
  envelopes: readonly string[],
): ChangeSetOp[] {
  const accepted = new Map<string, boolean>();
  for (const envelope of envelopes) {
    try {
      const payload = (
        JSON.parse(envelope) as { payload: { change_id: string; accepted: boolean } }
      ).payload;
      accepted.set(payload.change_id, payload.accepted);
    } catch {
      // an unreadable envelope toggles nothing
    }
  }
  return ops.map((op) => {
    const toggled = accepted.get(op.target);
    return toggled === undefined ? op : { ...op, accepted: toggled };
  });
}
