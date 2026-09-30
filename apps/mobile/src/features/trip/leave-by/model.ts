/**
 * The day-of leave-by as the screen shows it, from synced rows: when to leave, when the alarm
 * rings, where the countdown is (before the window, in it, gone), who is up and who the alarm will
 * wake. Pure, so the lab scenes, the alarm sync and the tests all read the same answer.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and JSON keys, never copy. */
import {
  DEFAULT_ALARM_POLICY,
  isAwake,
  type AlarmPolicy,
  type LeaveByPickup,
  type ReadinessState,
} from '@cp/domain';

/** The leave-by window: the ring drains over the last half hour. */
export const LEAVE_BY_WINDOW_MS = 30 * 60 * 1000;

export interface LeaveByRow {
  readonly id: string;
  readonly trip_id: string;
  readonly plan_item_id: string | null;
  readonly title: string | null;
  readonly place_name: string | null;
  readonly local_date: string;
  readonly starts_at: string;
  readonly leave_at: string;
  readonly pickup_at: string | null;
  readonly tz: string;
  readonly legs: string | null;
  readonly alarm_policy: string | null;
  readonly pickup: string | null;
  readonly buffer_min: number | null;
  readonly guide_note: string | null;
  readonly participant_ids: string | null;
  readonly state: string;
}

export interface ReadinessRow {
  readonly leave_by_id: string;
  readonly user_id: string;
  readonly state: ReadinessState;
  readonly snooze_count: number | null;
  readonly knock_sent_at: string | null;
}

export interface CrewMember {
  readonly id: string;
  readonly name: string;
  readonly joinIndex: number;
}

export type LeaveByPhase = 'before' | 'window' | 'transit' | 'overdue';

export interface ReadinessPerson extends CrewMember {
  readonly up: boolean;
  readonly me: boolean;
}

export interface LeaveByView {
  readonly id: string;
  readonly tripId: string;
  readonly title: string | null;
  readonly placeName: string | null;
  readonly localDate: string;
  readonly tz: string;
  readonly startsAt: Date;
  readonly leaveAt: Date;
  /** When the alarm rings for anyone still asleep (leave-by minus the lead). */
  readonly alarmAt: Date;
  readonly pickup: { readonly at: Date; readonly place: string | null } | null;
  readonly guideNote: string | null;
  /** Travel came from a straight-line estimate, not live traffic. */
  readonly withoutTraffic: boolean;
  readonly policy: AlarmPolicy;
  readonly phase: LeaveByPhase;
  /** 1 until the window opens, draining to 0 at the leave-by. */
  readonly ringFraction: number;
  readonly crew: readonly ReadinessPerson[];
  readonly upCount: number;
  readonly allUp: boolean;
  /** Everyone still asleep, in crew order (the alarm rings for them). */
  readonly sleepers: readonly ReadinessPerson[];
  readonly viewerIn: boolean;
  readonly viewerUp: boolean;
  readonly viewerSnoozes: number;
  /** The crew was pinged about a sleeper (second snooze, or asleep at the leave-by). */
  readonly knocked: boolean;
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Postgres arrays sync as JSON text (`["a","b"]`) or, from older rows, `{a,b}`. */
export function parseIdList(text: string | null | undefined): string[] {
  if (text === null || text === undefined || text === '') return [];
  if (text.startsWith('{')) {
    return text
      .slice(1, -1)
      .split(',')
      .map((id) => id.replace(/"/gu, '').trim())
      .filter((id) => id !== '');
  }
  const parsed = parseJson<unknown>(text, []);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}

function policyOf(row: LeaveByRow): AlarmPolicy {
  const parsed = parseJson<Partial<AlarmPolicy>>(row.alarm_policy, {});
  return {
    lead_min: typeof parsed.lead_min === 'number' ? parsed.lead_min : DEFAULT_ALARM_POLICY.lead_min,
    only_if_not_up:
      typeof parsed.only_if_not_up === 'boolean'
        ? parsed.only_if_not_up
        : DEFAULT_ALARM_POLICY.only_if_not_up,
    snooze_limit:
      typeof parsed.snooze_limit === 'number'
        ? parsed.snooze_limit
        : DEFAULT_ALARM_POLICY.snooze_limit,
  };
}

function withoutTraffic(row: LeaveByRow): boolean {
  const legs = parseJson<unknown>(row.legs, []);
  if (!Array.isArray(legs)) return false;
  return legs.some(
    (leg) =>
      typeof leg === 'object' &&
      leg !== null &&
      (leg as { kind?: unknown }).kind === 'route' &&
      (leg as { traffic?: unknown }).traffic !== true,
  );
}

function pickupOf(row: LeaveByRow): LeaveByView['pickup'] {
  const pickup = parseJson<Partial<LeaveByPickup> | null>(row.pickup, null);
  const at = pickup?.at ?? row.pickup_at;
  if (at === null || at === undefined) return null;
  return { at: new Date(at), place: pickup?.place ?? null };
}

export interface LeaveByInput {
  readonly row: LeaveByRow;
  readonly readiness: readonly ReadinessRow[];
  /** Crew in join order; participants of the item are picked from it. */
  readonly members: readonly CrewMember[];
  readonly me: string;
  readonly now: Date;
  /** My own readiness still in the upload queue, which wins over the synced row. */
  readonly myPending?: ReadinessState | null;
  /** Who the `trip_dayof` channel says is up, newer than the synced rows. */
  readonly liveUp?: ReadonlySet<string> | null;
}

export function buildLeaveBy(input: LeaveByInput): LeaveByView {
  const { row, me, now } = input;
  const policy = policyOf(row);
  const leaveAt = new Date(row.leave_at);
  const alarmAt = new Date(leaveAt.getTime() - policy.lead_min * 60_000);
  const participants = parseIdList(row.participant_ids);
  const byUser = new Map(input.readiness.map((r) => [r.user_id, r]));
  const isUp = (id: string): boolean => {
    if (id === me && input.myPending !== null && input.myPending !== undefined) {
      return isAwake(input.myPending);
    }
    if (input.liveUp?.has(id) === true) return true;
    const state = byUser.get(id)?.state;
    return state === undefined ? false : isAwake(state);
  };
  const ids = participants.length > 0 ? participants : input.readiness.map((r) => r.user_id);
  const known = new Map(input.members.map((m) => [m.id, m]));
  const crew = ids
    .map((id, index) => ({
      ...(known.get(id) ?? { id, name: '', joinIndex: input.members.length + index }),
      up: isUp(id),
      me: id === me,
    }))
    .sort((a, b) => a.joinIndex - b.joinIndex);
  const upCount = crew.filter((person) => person.up).length;
  const sleepers = crew.filter((person) => !person.up);
  const left = leaveAt.getTime() - now.getTime();
  const departed = row.state === 'departed';
  const phase: LeaveByPhase =
    left > LEAVE_BY_WINDOW_MS
      ? 'before'
      : left > 0 && !departed
        ? 'window'
        : sleepers.length > 0 && !departed
          ? 'overdue'
          : 'transit';
  const viewer = crew.find((person) => person.me);
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    placeName: row.place_name,
    localDate: row.local_date,
    tz: row.tz,
    startsAt: new Date(row.starts_at),
    leaveAt,
    alarmAt,
    pickup: pickupOf(row),
    guideNote: row.guide_note,
    withoutTraffic: withoutTraffic(row),
    policy,
    phase,
    ringFraction: Math.max(0, Math.min(1, left / LEAVE_BY_WINDOW_MS)),
    crew,
    upCount,
    allUp: crew.length > 0 && sleepers.length === 0,
    sleepers,
    viewerIn: viewer !== undefined,
    viewerUp: viewer?.up ?? false,
    viewerSnoozes: byUser.get(me)?.snooze_count ?? 0,
    knocked: input.readiness.some((r) => r.knock_sent_at !== null),
  };
}

/** "03:10" in the leave-by's own zone (24-hour, as the design sets it). */
export function clockIn(at: Date, tz: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** "21:29" (minutes:seconds) under an hour, "1:21:29" above, "0:00" once due. */
export function countdownText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}
