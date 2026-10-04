/**
 * The notification catalogue (docs/api-contracts-async.md §2.2 `notify.route`, §3.1, §3.3, §3.4):
 * every push the product sends, under a semantic key, with the class the router enforces, the iOS
 * category / Android channel it is shown under, who it comes from, how it collapses and when it goes
 * stale. Copy templates and the events that trigger each key are registered by the owning feature
 * (services/worker/src/jobs/notify/register.ts); this file is the shared, pure part both the worker
 * and the apps read.
 *
 * Which domain events trigger which keys is declared here too (`NOTIFICATION_TRIGGERS`), because
 * both processes that append domain events (the api and the worker) must enqueue `notify.route`
 * in the same transaction as the event; the audience and copy live with the worker registration.
 *
 * Classes: `always` bypasses the daily budget and quiet hours; `budgeted` counts toward the budget
 * and waits for the evening roundup when over budget or in quiet hours; `roundup_only` is only ever
 * a roundup line; `silent` is a data/Live Activity/widget push handled by its own queue; `local` is
 * scheduled on the device and only mirrored into the ledger.
 */
import { z } from 'zod';

// prettier-ignore
export const NOTIFICATION_CLASSES = [
  'always', 'budgeted', 'roundup_only', 'silent', 'local',
] as const;
export type NotificationClass = (typeof NOTIFICATION_CLASSES)[number];

/** Class rules that depend on the event: resolved by `resolveNotificationClass`. */
export const CLASS_VARIANTS = [
  /** Small money items (nudges, tiny settles) only go to the roundup. */
  'small_to_roundup',
  /** ALWAYS when the change alters the plan, otherwise a roundup line. */
  'always_if_plan_changing',
  /** Scheduled on the device; a server-side copy is budgeted. */
  'local_or_budgeted',
  /** Scheduled on the device; a server-side fallback is ALWAYS. */
  'local_or_always',
] as const;
export type ClassVariant = (typeof CLASS_VARIANTS)[number];

// prettier-ignore
export const NOTIFICATION_CATEGORIES = [
  'cp.vote', 'cp.changeset', 'cp.disruption', 'cp.leaveby', 'cp.sos', 'cp.money', 'cp.chat',
  'cp.rsvp', 'cp.invite', 'cp.import', 'cp.briefing', 'cp.help', 'cp.memory', 'cp.setup_ask',
  'cp.generic',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// prettier-ignore
export const ANDROID_CHANNELS = [
  'cp_always', 'cp_alarm', 'cp_crew_chat', 'cp_votes', 'cp_money', 'cp_trip', 'cp_guide',
  'cp_critters', 'cp_roundup', 'cp_sos',
] as const;
export type AndroidChannel = (typeof ANDROID_CHANNELS)[number];

export const SENDER_KINDS = ['guide', 'member', 'system'] as const;
export type SenderKind = (typeof SENDER_KINDS)[number];

export const INTERRUPTION_LEVELS = ['passive', 'active', 'time-sensitive'] as const;
export type InterruptionLevel = (typeof INTERRUPTION_LEVELS)[number];

/** The `notification_prefs` switch that can mute a key (ALWAYS keys ignore it). */
// prettier-ignore
export const NOTIFICATION_PREF_GATES = [
  'guide_tips', 'money', 'critters_nearby', 'crew_chat',
] as const;
export type NotificationPrefGate = (typeof NOTIFICATION_PREF_GATES)[number];

export type NotificationDelivery = 'push' | 'email' | 'push_and_email';

export interface NotificationSpec {
  readonly key: string;
  readonly class: NotificationClass;
  readonly variant?: ClassVariant;
  readonly category: NotificationCategory;
  readonly channel: AndroidChannel;
  readonly sender: SenderKind;
  /** `apns-collapse-id` / FCM tag template, `{var}` filled from the event context. */
  readonly collapse?: string;
  /** Seconds after which an undelivered notification is dropped. */
  readonly ttlSeconds: number;
  readonly interruption: InterruptionLevel;
  /** APNs `relevance-score`, 0–1. */
  readonly relevance: number;
  /** Counts toward the paywall governor (at most one per local day). */
  readonly paywall: boolean;
  /** Minimal-payload mode (`cp.full: false`): the extension fetches the content with its key. */
  readonly private: boolean;
  /** Held while the recipient's app is on screen (the app shows it in place instead). */
  readonly onlyIfBackgrounded: boolean;
  /**
   * Counts toward the recipient's daily budget. A budgeted push that is not capped still waits
   * out quiet hours and its preference switch; it just never spends, or runs out of, the budget.
   */
  readonly capped: boolean;
  readonly pref?: NotificationPrefGate;
  readonly delivery: NotificationDelivery;
}

type SpecOptions = Partial<
  Omit<NotificationSpec, 'key' | 'class' | 'category' | 'channel' | 'sender'>
>;

const HOUR = 3600;

/** BUDGET pushes a person gets per local day until they choose their own number (1–10). */
export const DEFAULT_BUDGET_PER_DAY = 10;

function spec(
  key: string,
  cls: NotificationClass,
  category: NotificationCategory,
  channel: AndroidChannel,
  sender: SenderKind,
  collapseOrOptions: string | SpecOptions = {},
): NotificationSpec {
  const options =
    typeof collapseOrOptions === 'string' ? { collapse: collapseOrOptions } : collapseOrOptions;
  return {
    key,
    class: cls,
    category,
    channel,
    sender,
    ttlSeconds: cls === 'always' ? 6 * HOUR : cls === 'roundup_only' ? 48 * HOUR : 24 * HOUR,
    interruption: cls === 'always' ? 'time-sensitive' : 'active',
    relevance: cls === 'always' ? 1 : 0.5,
    paywall: false,
    private: false,
    onlyIfBackgrounded: false,
    capped: true,
    delivery: 'push',
    ...options,
  };
}

const passive = { interruption: 'passive', relevance: 0.2 } as const;

// One row per notification: the catalogue reads as the table it is.
// prettier-ignore
const CATALOGUE = [
  // Deciding together.
  spec('vote_needs_you', 'budgeted', 'cp.vote', 'cp_votes', 'guide', 'vote:{poll_id}'),
  spec('vote_closing', 'budgeted', 'cp.vote', 'cp_votes', 'guide', { collapse: 'vote:{poll_id}', relevance: 0.8 }),
  spec('winner_revealed', 'budgeted', 'cp.generic', 'cp_votes', 'guide', 'vote:{poll_id}'),
  spec('setup_task', 'budgeted', 'cp.generic', 'cp_trip', 'guide', 'setup:{trip_id}'),
  spec('guide_availability_ask', 'budgeted', 'cp.setup_ask', 'cp_guide', 'guide'),
  spec('availability_reply', 'budgeted', 'cp.generic', 'cp_trip', 'member', { private: true }),
  spec('draft_ready', 'budgeted', 'cp.generic', 'cp_trip', 'guide', { onlyIfBackgrounded: true, collapse: 'draft:{trip_id}' }),
  spec('ideas_placed', 'budgeted', 'cp.generic', 'cp_trip', 'guide', { ...passive, onlyIfBackgrounded: true, collapse: 'ideas:{trip_id}' }),
  spec('check_ask_member', 'budgeted', 'cp.generic', 'cp_trip', 'member', 'ask:{ask_id}'),
  spec('proposal_version', 'budgeted', 'cp.rsvp', 'cp_trip', 'guide', { relevance: 0.9 }),
  spec('scheduled_resend', 'budgeted', 'cp.generic', 'cp_trip', 'guide'),
  spec('reply_by_expiring', 'always', 'cp.rsvp', 'cp_always', 'guide', 'reply_by:{trip_id}'),
  spec('hold_expiring', 'always', 'cp.generic', 'cp_always', 'guide', 'hold:{hold_id}'),
  spec('rsvp_changed', 'budgeted', 'cp.generic', 'cp_trip', 'member', 'rsvp:{trip_id}'),
  spec('trip_confirmed', 'budgeted', 'cp.generic', 'cp_trip', 'guide', { collapse: 'trip_confirmed:{trip_id}', relevance: 0.9 }),
  // Chat collapses to one banner per crew, so it cannot pile up: it does not spend the budget.
  spec('crew_chat', 'budgeted', 'cp.chat', 'cp_crew_chat', 'member', { pref: 'crew_chat', private: true, capped: false, collapse: 'chat:{crew_id}' }),
  spec('nudge', 'budgeted', 'cp.generic', 'cp_guide', 'guide', { pref: 'guide_tips' }),
  spec('crew_invite_received', 'budgeted', 'cp.invite', 'cp_trip', 'member'),
  spec('seat_opened', 'budgeted', 'cp.rsvp', 'cp_trip', 'guide', { relevance: 0.8 }),
  spec('invite_opened', 'roundup_only', 'cp.generic', 'cp_roundup', 'guide'),
  spec('member_joined', 'budgeted', 'cp.generic', 'cp_trip', 'member'),
  spec('lottery_deadline', 'budgeted', 'cp.generic', 'cp_trip', 'guide'),
  spec('lottery_result', 'budgeted', 'cp.generic', 'cp_trip', 'guide'),
  // Bookings and travel day.
  spec('bookings_found', 'roundup_only', 'cp.import', 'cp_trip', 'guide'),
  spec('flight_changed', 'always', 'cp.generic', 'cp_always', 'guide', 'flight:{flight_id}'),
  spec('boarding_open', 'always', 'cp.generic', 'cp_always', 'guide', 'flight:{flight_id}'),
  spec('booking_deadline', 'always', 'cp.generic', 'cp_always', 'guide', 'deadline:{booking_id}'),
  spec('landed_egg_hatch', 'budgeted', 'cp.generic', 'cp_critters', 'guide'),
  spec('leave_by_la_start', 'silent', 'cp.leaveby', 'cp_trip', 'system', 'leave_by:{leave_by_id}'),
  spec('leave_by_alarm', 'local', 'cp.leaveby', 'cp_alarm', 'guide', { variant: 'local_or_always', collapse: 'leave_by:{leave_by_id}' }),
  spec('crew_knock', 'always', 'cp.leaveby', 'cp_always', 'member', 'leave_by:{leave_by_id}'),
  spec('morning_briefing', 'budgeted', 'cp.briefing', 'cp_guide', 'guide', 'briefing:{trip_id}'),
  spec('meetup_la_update', 'silent', 'cp.generic', 'cp_trip', 'system'),
  spec('crew_ping', 'always', 'cp.generic', 'cp_always', 'member'),
  spec('meetup_changed', 'budgeted', 'cp.generic', 'cp_trip', 'member', 'meetup:{meetup_id}'),
  spec('running_late_detected', 'always', 'cp.generic', 'cp_always', 'guide', 'late:{plan_item_id}',),
  spec('sos', 'always', 'cp.sos', 'cp_sos', 'member', { collapse: 'sos:{sos_id}', ttlSeconds: HOUR }),
  spec('sos_resolved', 'always', 'cp.generic', 'cp_sos', 'member', 'sos:{sos_id}'),
  spec('help_share_changed', 'budgeted', 'cp.help', 'cp_trip', 'member', { private: true }),
  spec('location_share_ending', 'budgeted', 'cp.help', 'cp_trip', 'system', 'share:{share_id}'),
  spec('watch_escalation', 'roundup_only', 'cp.generic', 'cp_trip', 'guide', { variant: 'always_if_plan_changing' }),
  spec('disruption_update', 'always', 'cp.disruption', 'cp_always', 'guide', 'disruption:{disruption_id}',),
  spec('guide_acted', 'budgeted', 'cp.changeset', 'cp_guide', 'guide', 'guide_action:{action_id}'),
  spec('changeset_needs_yes', 'budgeted', 'cp.changeset', 'cp_votes', 'guide', 'changeset:{change_set_id}'),
  spec('changeset_decided', 'budgeted', 'cp.generic', 'cp_trip', 'guide', 'changeset:{change_set_id}'),
  // Money.
  spec('money_event', 'budgeted', 'cp.money', 'cp_money', 'member', { variant: 'small_to_roundup', pref: 'money', private: true }),
  spec('settled_reward', 'always', 'cp.generic', 'cp_critters', 'guide'),
  // Critters, quests, memories.
  spec('critter_nearby', 'budgeted', 'cp.generic', 'cp_critters', 'guide', { pref: 'critters_nearby', ttlSeconds: HOUR }),
  spec('critter_window_reminder', 'local', 'cp.generic', 'cp_critters', 'guide', { variant: 'local_or_budgeted' }),
  spec('quests_ready', 'roundup_only', 'cp.generic', 'cp_critters', 'guide'),
  spec('crewmate_befriended', 'roundup_only', 'cp.generic', 'cp_critters', 'member'),
  spec('recap_ready', 'budgeted', 'cp.generic', 'cp_trip', 'guide'),
  spec('mvp_vote_open', 'roundup_only', 'cp.generic', 'cp_roundup', 'guide'),
  spec('anniversary_memory', 'budgeted', 'cp.memory', 'cp_trip', 'guide', passive),
  spec('queued_answer', 'budgeted', 'cp.generic', 'cp_guide', 'guide', passive),
  spec('evening_roundup', 'roundup_only', 'cp.generic', 'cp_roundup', 'guide', 'roundup:{local_date}',),
  // Pass, Boost and billing.
  spec('free_boost_ending', 'budgeted', 'cp.generic', 'cp_trip', 'guide', { paywall: true }),
  spec('boost_activated', 'budgeted', 'cp.generic', 'cp_trip', 'member'),
  spec('gift_received', 'budgeted', 'cp.generic', 'cp_trip', 'member'),
  spec('billing_failed', 'always', 'cp.generic', 'cp_always', 'system'),
  spec('pass_resume_reminder', 'budgeted', 'cp.generic', 'cp_guide', 'guide', { paywall: true }),
  // Account and product.
  spec('idea_shipped', 'roundup_only', 'cp.generic', 'cp_roundup', 'system'),
  spec('data_export_ready', 'budgeted', 'cp.generic', 'cp_guide', 'system', { delivery: 'push_and_email' }),
  spec('deletion_confirmed', 'budgeted', 'cp.generic', 'cp_guide', 'system', { delivery: 'push_and_email' }),
  spec('account_purge_reminder', 'budgeted', 'cp.generic', 'cp_guide', 'system', { delivery: 'email' }),
] as const satisfies readonly NotificationSpec[];

export type NotificationKey = (typeof CATALOGUE)[number]['key'];

const BY_KEY: ReadonlyMap<string, NotificationSpec> = new Map(
  CATALOGUE.map((entry) => [entry.key, entry]),
);

export const NOTIFICATION_KEYS: readonly NotificationKey[] = CATALOGUE.map((entry) => entry.key);

export function getNotificationSpec(key: string): NotificationSpec | undefined {
  return BY_KEY.get(key);
}

export function isNotificationKey(value: string): value is NotificationKey {
  return BY_KEY.has(value);
}

/** Event facts a class variant depends on. */
export interface ClassContext {
  /** The money item is small (a nudge, a sub-threshold settle). */
  readonly small?: boolean;
  /** The change alters the plan (a watch escalation that moves or cancels something). */
  readonly planChanging?: boolean;
  /** The server is sending the remote copy of a normally device-scheduled notification. */
  readonly remote?: boolean;
}

/** The class this one delivery is routed under. */
export function resolveNotificationClass(
  entry: NotificationSpec,
  context: ClassContext = {},
): NotificationClass {
  const variant: ClassVariant | undefined = entry.variant;
  switch (variant) {
    case 'small_to_roundup':
      return context.small === true ? 'roundup_only' : 'budgeted';
    case 'always_if_plan_changing':
      return context.planChanging === true ? 'always' : 'roundup_only';
    case 'local_or_budgeted':
      return context.remote === true ? 'budgeted' : 'local';
    case 'local_or_always':
      return context.remote === true ? 'always' : 'local';
    case undefined:
      return entry.class;
  }
}

/** Fills `{var}` placeholders of a collapse template; `undefined` when a variable is missing. */
export function renderCollapseKey(
  template: string | undefined,
  vars: Readonly<Record<string, string | number | undefined>>,
): string | undefined {
  if (template === undefined) return undefined;
  let missing = false;
  const rendered = template.replace(/\{([a-z_]+)\}/g, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) missing = true;
    return String(value ?? '');
  });
  return missing ? undefined : rendered;
}

/** The routing queue and its payload, shared by every process that enqueues it. */
export const NOTIFY_ROUTE_QUEUE = 'notify.route';

export const notifyRouteJobSchema = z.object({
  event_id: z.uuid(),
  key: z.string().min(1),
  /** Absent on the per-event fan-out job; present on each recipient's job. */
  uid: z.uuid().optional(),
});
export type NotifyRouteJob = z.infer<typeof notifyRouteJobSchema>;

/** One queued-or-active routing job per (event, key, recipient). */
export function notifyRouteSingletonKey(job: NotifyRouteJob): string {
  return `${job.event_id}:${job.key}:${job.uid ?? '*'}`;
}

/**
 * Domain event type → the catalogue keys it triggers. A feature adds its row here and registers the
 * matching audience and copy with the worker's `registerNotification`, which refuses a key that
 * is not declared here, so the api and the worker never disagree about what gets routed.
 */
const NOTIFICATION_TRIGGERS: Readonly<Record<string, readonly NotificationKey[]>> = {
  // Crew growth: a freed seat offered to the next person waiting, an in-app crew invite to someone
  // already on CritterPass, and the one nudge an installed invitee gets after a day.
  'trip.seat_opened': ['seat_opened'],
  'invite.created': ['crew_invite_received'],
  'invite.nudged': ['nudge'],
  // Someone new in the crew, to the members already there.
  'crew.member_joined': ['member_joined'],
  // A crewmate's nudge, delivered by the guide at the target's engagement hour.
  'nudge.received': ['nudge'],
  // Crew chat: a new message, to members by their per-crew level.
  'chat.message_sent': ['crew_chat'],
  // Crew live map: PING ALL / I'M ON MY WAY, and meet-up changes to the sharing crew.
  'crew.pinged': ['crew_ping'],
  'meetup.created': ['meetup_changed'],
  'meetup.moved': ['meetup_changed'],
  'meetup.crew_close': ['meetup_changed'],
  // Help and SOS: an SOS (and its unanswered re-push) to the crew through Do Not Disturb, the
  // all-clear when it resolves, and the budgeted notice that someone is sharing from Help.
  'sos.triggered': ['sos'],
  'sos.escalated': ['sos'],
  'sos.resolved': ['sos_resolved'],
  'help_share.started': ['help_share_changed'],
  'help_share.ending': ['location_share_ending'],
  // Polls: a vote that needs you (a new poll, or the destination final), the reminders before it
  // closes to those who have not voted, and the destination winner.
  'poll.created': ['vote_needs_you'],
  'poll.stage_changed': ['vote_needs_you'],
  'poll.closing_soon': ['vote_closing'],
  'poll.closed': ['winner_revealed'],
  // Trip setup: the guide's private ask to one member and its answer (or timeout) to whoever asked,
  // the stale-calendar and must-do prompts, and a tracked lottery's reminders.
  'availability_ask.created': ['guide_availability_ask'],
  'availability_ask.answered': ['availability_reply'],
  'availability_ask.timed_out': ['availability_reply'],
  'calendar.stale': ['setup_task'],
  'must_do.prompted': ['setup_task'],
  'room_swap.requested': ['setup_task'],
  'lottery.reminder_due': ['lottery_deadline'],
  // Drafting: the organiser's draft is ready (pushed only when the app is in the background).
  'draft.ready': ['draft_ready'],
  // Planning: Tokek finished placing ideas; the requester's private review is ready.
  'ideas.placed': ['ideas_placed'],
  // An organiser's private ask about one member's saves, to that member only.
  'check.member_asked': ['check_ask_member'],
  'guide.question_answered': ['queued_answer'],
  // Money: a new expense to the members it splits with, requests, nudges, reminders and
  // confirmations to the other side of each payment, and the Settled Tokek to everyone at once.
  'expense.added': ['money_event'],
  'payment.requested': ['money_event'],
  'payment.nudged': ['money_event'],
  'payment.reminded': ['money_event'],
  'payment.marked_paid': ['money_event'],
  'payment.confirmed': ['money_event'],
  'payment.disputed': ['money_event'],
  'trip.settled': ['settled_reward'],
  // Quests: the day's quests in the evening roundup, and a finished quest's reward to its crew.
  'quest.published': ['quests_ready'],
  'quest.completed': ['settled_reward'],
  // Change review: an affected member's yes is needed, then how the vote came out.
  'change_set.proposed': ['changeset_needs_yes'],
  'change_set.applied': ['changeset_decided'],
  'change_set.rejected': ['changeset_decided'],
  'change_set.expired': ['changeset_decided'],
  // Bookings: a new import candidate (the evening roundup's "found n bookings" line), a flight
  // delay, gate change, cancel or divert and boarding to the traveller, and the day-before reminder
  // of a free-cancellation deadline to the booking's owner.
  'import.candidate_created': ['bookings_found'],
  'flight.status_changed': ['flight_changed'],
  'flight.boarding_open': ['boarding_open'],
  'booking.deadline_due': ['booking_deadline'],
  // Trip day: the crew knock for a sleeper, the remote copy of an alarm no device confirmed, a
  // member running late (the crew ping) and the morning briefing's one push.
  // Proposals: each recipient's version (N-07), a follow-up or resend that came due (N-08) and the
  // day-before reply-by reminder (N-09).
  'proposal.sent': ['proposal_version'],
  // A member's own answer to the trip (in, maybe, out, waitlisted), to its organisers.
  'rsvp.changed': ['rsvp_changed'],
  // The trip is on (the organiser locked it, or enough were in at reply-by), to everyone on it.
  'trip.status_changed': ['trip_confirmed'],
  'followup.due': ['scheduled_resend'],
  'proposal.reply_by_soon': ['reply_by_expiring'],
  'leave_by.knocked': ['crew_knock'],
  'leave_by.alarm_due': ['leave_by_alarm'],
  'member.running_late': ['crew_ping'],
  'briefing.built': ['morning_briefing'],
  // Critters: the egg hatching on arrival, a crewmate's find (roundup) and a legendary window a
  // month away.
  'egg.hatched': ['landed_egg_hatch'],
  'critter.befriended': ['crewmate_befriended'],
  'legendary.reminder_due': ['critter_window_reminder'],
  // Account: a "Download my data" zip is ready, to its owner.
  'data_export.ready': ['data_export_ready'],
  // The recap: ready once per trip; a year later, quietly.
  'recap.ready': ['recap_ready'],
  'memory.surfaced': ['anniversary_memory'],
};

const triggers = new Map<string, Set<NotificationKey>>(
  Object.entries(NOTIFICATION_TRIGGERS).map(([event, keys]) => [event, new Set(keys)]),
);

/** Adds one trigger at runtime (a feature module, or a test). Idempotent. */
export function registerNotificationTrigger(event: string, key: NotificationKey): void {
  const keys = triggers.get(event) ?? new Set<NotificationKey>();
  keys.add(key);
  triggers.set(event, keys);
}

export function notificationKeysForEvent(event: string): readonly NotificationKey[] {
  return [...(triggers.get(event) ?? [])];
}

/** Test-only: back to the declared triggers. */
export function resetNotificationTriggersForTests(): void {
  triggers.clear();
  for (const [event, keys] of Object.entries(NOTIFICATION_TRIGGERS))
    triggers.set(event, new Set(keys));
}
