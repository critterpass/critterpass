/**
 * The queue catalogue (docs/api-contracts-async.md §2.2, §2.3): every pg-boss queue with a fixed
 * name, its retry, expiry and dead-letter policy, the cron that feeds it when it is periodic, and
 * what it does. The worker creates its queues from this table at boot; the api's jobs panel reads
 * the same table for descriptions and crons, and redacts each queue's payloads before showing them.
 * Later features append rows.
 */

/** pg-boss queue policies (pg-boss `QueuePolicy`). */
export type QueuePolicy =
  'standard' | 'short' | 'singleton' | 'stately' | 'exclusive' | 'key_strict_fifo';

export const DLQ_SUFFIX = '.dlq';

/** The dead-letter queue a queue's terminally failed jobs are copied into. */
export function dlqName(queue: string): string {
  return `${queue}${DLQ_SUFFIX}`;
}

export interface QueueCron {
  /** Five-field cron expression. */
  readonly expr: string;
  /** IANA zone the expression is read in. */
  readonly tz: string;
}

export interface QueueSpec {
  readonly policy: QueuePolicy;
  readonly retryLimit: number;
  /** Seconds before the first retry; doubled per attempt (with jitter) when `retryBackoff`. */
  readonly retryDelay: number;
  readonly retryBackoff: boolean;
  /** How long one attempt may stay active before pg-boss fails it. */
  readonly expireInSeconds: number;
  /** Seconds a completed job is kept (pg-boss `deleteAfterSeconds`). */
  readonly keepCompletedSeconds: number;
  /** Terminal failures land in `<queue>.dlq`, alert, and wait for a redrive. */
  readonly deadLetter: boolean;
  /** Wake workers with NOTIFY on insert instead of waiting for their next poll. */
  readonly notify: boolean;
  readonly cron?: QueueCron;
}

const DAY = 86_400;

/** Default policy for event-driven queues: 3 retries, exponential from 10 s. */
export const DEFAULT_QUEUE_SPEC: QueueSpec = {
  policy: 'standard',
  retryLimit: 3,
  retryDelay: 10,
  retryBackoff: true,
  expireInSeconds: 15 * 60,
  keepCompletedSeconds: 7 * DAY,
  deadLetter: false,
  notify: false,
};

/** Dead-lettered jobs wait this long for a redrive before pg-boss drops them. */
export const DLQ_RETENTION_SECONDS = 30 * DAY;

function spec(overrides: Partial<QueueSpec>): QueueSpec {
  return { ...DEFAULT_QUEUE_SPEC, ...overrides };
}

export const QUEUES = {
  /** One drain at a time, one queued behind it: wake storms collapse into a single follow-up run. */
  'rt.relay': spec({
    policy: 'stately',
    retryLimit: 10,
    retryDelay: 1,
    retryBackoff: false,
    expireInSeconds: 60,
    keepCompletedSeconds: 3600,
    notify: true,
  }),
  'sched.enqueue_due': spec({
    policy: 'stately',
    retryDelay: 5,
    retryBackoff: false,
    expireInSeconds: 55,
    keepCompletedSeconds: DAY,
    cron: { expr: '* * * * *', tz: 'UTC' },
  }),
  // Keyed queues (`exclusive`): one queued-or-active job per natural key, so a repeated send while
  // the first is pending folds into it; after completion the handler's own re-read keeps it a no-op.
  'notify.route': spec({ policy: 'exclusive', deadLetter: true, notify: true }),
  // Dead-lettered so a push that failed every retry can be seen and redriven from the console.
  'push.send': spec({ policy: 'exclusive', retryLimit: 5, deadLetter: true, notify: true }),
  'roundup.build': spec({ policy: 'exclusive' }),
  'quota.release': spec({ policy: 'exclusive', retryLimit: 5, deadLetter: true }),
  'maint.purge': spec({
    policy: 'stately',
    expireInSeconds: 60 * 60,
    cron: { expr: '30 3 * * *', tz: 'Asia/Singapore' },
  }),
  'maint.anon_gc': spec({
    policy: 'stately',
    expireInSeconds: 60 * 60,
    cron: { expr: '0 4 * * *', tz: 'UTC' },
  }),
  'guide_action.execute': spec({ policy: 'exclusive', deadLetter: true, notify: true }),
  'guide_action.undo_expire': spec({ policy: 'exclusive' }),
  // Travel data (docs/api-contracts-async.md §2.3): one run at a time; a rerun inside the same
  // night is a no-op because every cell remembers when it was last asked.
  'fares.refresh': spec({
    policy: 'stately',
    retryDelay: 600,
    expireInSeconds: 2 * 60 * 60,
    cron: { expr: '0 2 * * *', tz: 'Asia/Singapore' },
  }),
  'crowds.refresh': spec({
    policy: 'stately',
    expireInSeconds: 60 * 60,
    cron: { expr: '0 3 * * *', tz: 'Asia/Singapore' },
  }),
  // Every 15 minutes; each forecast point decides whether it is due (3 h, 1 h, or 15 min marine).
  'weather.refresh': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  }),
  // Every 15 minutes; the handler reads the feeds hourly, or every tick while a trip is under way.
  'hazards.refresh': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  }),
  'fx.refresh': spec({
    policy: 'stately',
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '15 * * * *', tz: 'UTC' },
  }),
  // Daily; the handler works on Mondays and during blossom/foliage windows only.
  'season.ingest': spec({
    policy: 'stately',
    expireInSeconds: 30 * 60,
    cron: { expr: '0 4 * * *', tz: 'Asia/Singapore' },
  }),
  // Monthly: web research proposes the month three months ahead's dated events for review.
  'season.research': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 30 * 60,
    cron: { expr: '0 5 1 * *', tz: 'Asia/Singapore' },
  }),
  // Content releases (docs/api-contracts-async.md §2.2): publishing replaces a kind's catalogue in
  // one transaction, so jobs for the same release fold into one.
  'content.publish': spec({ policy: 'exclusive', retryLimit: 2, deadLetter: true }),
  'content.embed': spec({ policy: 'exclusive' }),
  // Re-prices one trip; keyed per trip so a burst of input changes folds into one queued run,
  // and the handler is a no-op when the input hash has not moved.
  'cost.recompute': spec({ policy: 'exclusive', notify: true }),
  // Location retention: live fixes expire after 15 minutes (open SOS kept), visits after their
  // trip is archived + 30 days.
  'location.fixes_ttl': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 55,
    keepCompletedSeconds: 3600,
    cron: { expr: '* * * * *', tz: 'UTC' },
  }),
  // Crew live map: a meet-up's ETAs are recounted every minute while someone shares (one short
  // attempt: the next run is a minute away), and a crew-map share's end is announced at its
  // last-day midnight by a per-share timer.
  'eta.meetups': spec({ retryLimit: 1, expireInSeconds: 50, keepCompletedSeconds: 3600 }),
  'location.expire': spec({ retryLimit: 3, keepCompletedSeconds: 86_400 }),
  'visits.ttl': spec({
    policy: 'stately',
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '5 * * * *', tz: 'UTC' },
  }),
  // Photo avatars: moderation once per upload (keyed per avatar, dead-lettered so a stuck check
  // alerts), then its PNG variants once approved.
  'avatar.moderate': spec({ policy: 'exclusive', deadLetter: true, notify: true }),
  'avatar.render': spec({ policy: 'exclusive', notify: true }),
  // Crew chat media: one thumbnail per photo message and one normalised AAC per voice note, keyed
  // per message.
  'chat.photo_thumbnail': spec({ policy: 'exclusive', notify: true }),
  'chat.voice_transcode': spec({ policy: 'exclusive', notify: true, expireInSeconds: 5 * 60 }),
  // Crew growth: hourly invite and code expiry with prefill purge, the minute waitlist sweep that
  // offers freed seats, lapsing unanswered offers, the one-day nudge to installed invitees, and
  // moving referrals towards their reward.
  'maint.codes': spec({
    policy: 'stately',
    retryLimit: 2,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '0 * * * *', tz: 'UTC' },
  }),
  'waitlist.offer': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 55,
    keepCompletedSeconds: 3600,
    cron: { expr: '* * * * *', tz: 'UTC' },
  }),
  'waitlist.offer_expire': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 4 * 60,
    keepCompletedSeconds: 3600,
    cron: { expr: '*/5 * * * *', tz: 'UTC' },
  }),
  'referral.evaluate': spec({
    policy: 'stately',
    retryLimit: 2,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '*/15 * * * *', tz: 'UTC' },
  }),
  'invites.nudge': spec({
    policy: 'stately',
    retryLimit: 2,
    expireInSeconds: 10 * 60,
    keepCompletedSeconds: 86_400,
    cron: { expr: '15 * * * *', tz: 'UTC' },
  }),
  // Share cards: warmed when an invite or referral code is shared, purged when it stops resolving.
  'og.render': spec({
    policy: 'stately',
    retryLimit: 3,
    retryDelay: 30,
    expireInSeconds: 60,
    keepCompletedSeconds: 86_400,
  }),
  'ops.backup': spec({
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 300,
    expireInSeconds: 3 * 60 * 60,
    deadLetter: true,
    cron: { expr: '0 20 * * *', tz: 'UTC' },
  }),
  // Every 5 minutes: AI spend against its caps; alerts at 80 %, pauses a tier at 100 %.
  'ops.ai_cost_guard': spec({
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 4 * 60,
    keepCompletedSeconds: DAY,
    cron: { expr: '*/5 * * * *', tz: 'UTC' },
  }),
  // Home: one inbox fan-out per domain event (idempotent per (event, user) in the table), a nudge
  // delivered at its target's engagement hour, the morning tip scan (and a rerun per crew when a
  // fare drops), and the countdown target recomputed when its inputs change.
  'inbox.fanout': spec({ policy: 'exclusive', deadLetter: true, notify: true }),
  'nudge.dispatch': spec({ policy: 'exclusive', deadLetter: true }),
  'tips.generate': spec({
    policy: 'exclusive',
    retryLimit: 2,
    expireInSeconds: 30 * 60,
    cron: { expr: '0 6 * * *', tz: 'Asia/Singapore' },
  }),
  'countdown.recompute': spec({ policy: 'exclusive', notify: true }),
} as const satisfies Record<string, QueueSpec>;

export type QueueName = keyof typeof QUEUES;

/** The catalogue entry for `name`; throws for a queue the catalogue does not know. */
export function queueSpec(name: string): QueueSpec {
  const entry: QueueSpec | undefined = (QUEUES as Record<string, QueueSpec>)[name];
  if (entry === undefined) throw new Error(`queue ${name} is not in the queue catalogue`);
  return entry;
}

/** What each queue does, for the console's jobs panel. Queues missing here show their name only. */
export const QUEUE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'rt.relay': 'Publishes realtime outbox rows to Centrifugo',
  'sched.enqueue_due': 'Enqueues scheduled events that are due',
  'notify.route': 'Routes a domain event to its notification recipients',
  'push.send': 'Sends one push notification to one device',
  'roundup.build': "Builds a crew's evening roundup",
  'quota.release': 'Releases a held usage quota',
  'maint.purge': 'Deletes rows past their retention',
  'maint.anon_gc': 'Removes abandoned anonymous accounts',
  'guide_action.execute': 'Carries out an approved guide action',
  'guide_action.undo_expire': "Closes a guide action's undo window",
  'fares.refresh': 'Refreshes the fare calendar cells',
  'crowds.refresh': 'Refreshes venue crowd forecasts',
  'weather.refresh': 'Refreshes weather and marine forecasts',
  'hazards.refresh': 'Reads hazard feeds for trips under way',
  'fx.refresh': 'Refreshes exchange-rate snapshots',
  'season.ingest': 'Ingests season curves from their sources',
  'season.research': 'Researches dated season events for review',
  'content.publish': 'Publishes an approved content release',
  'content.embed': 'Embeds catalogue content for search',
  'cost.recompute': "Re-prices one trip's costs",
  'location.fixes_ttl': 'Expires live location fixes',
  'visits.ttl': 'Expires visits of archived trips',
  'eta.meetups': "Recounts a crew meet-up's ETAs every minute",
  'location.expire': 'Ends a crew-map share at last-day midnight',
  'avatar.moderate': 'Moderates one uploaded photo avatar',
  'avatar.render': "Renders an approved avatar's PNG variants",
  'chat.photo_thumbnail': "Renders a chat photo's thumbnail",
  'chat.voice_transcode': 'Normalises a chat voice note to AAC and measures it',
  'maint.codes': 'Expires invites and codes; purges old invite prefill',
  'waitlist.offer': 'Offers freed trip seats to the next person waiting',
  'waitlist.offer_expire': 'Lapses unanswered seat offers and offers the seat on',
  'referral.evaluate': 'Qualifies, voids and rewards referrals',
  'invites.nudge': 'Nudges installed invitees once after a day',
  'og.render': 'Draws or purges one invite or referral share card',
  'ops.backup': 'Backs the database up to object storage',
  'ops.ai_cost_guard': 'Checks AI spend against its caps; pauses a tier over its cap',
  'compliance.check': 'Screens text created offline',
  'inbox.fanout': "Files a domain event's inbox items and settles the ones it answers",
  'nudge.dispatch': "Delivers a nudge at its target's engagement hour",
  'tips.generate': "Finds data-backed tips for crews' Home strip",
  'countdown.recompute': "Recomputes trip participants' countdown targets",
};

export type JobPayloadRedactor = (data: unknown) => unknown;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Short machine values (kinds, keys, dates, routes) are safe to show; anything else is masked. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:+-]{1,64}$/;
const SECRET_KEY = /token|secret|password|key_material|authorization/i;

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (SECRET_KEY.test(key)) return value.length > 4 ? `…${value.slice(-4)}` : '…';
    return UUID.test(value) || SAFE_TOKEN.test(value) ? value : '[redacted]';
  }
  if (depth >= 4) return '[redacted]';
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactValue(key, item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactValue(k, v, depth + 1)]),
    );
  }
  return '[redacted]';
}

/**
 * The default payload redaction: ids, numbers, flags and short machine values stay; free text is
 * masked; anything under a token or secret key shows only its last 4 characters.
 */
export const redactJobPayload: JobPayloadRedactor = (data) => redactValue('', data, 0);

/** Per-queue redaction where the default is not enough; every other queue uses the default. */
const QUEUE_REDACTORS: Readonly<Record<string, JobPayloadRedactor>> = {};

export function jobPayloadRedactor(queue: string): JobPayloadRedactor {
  const base = queue.endsWith(DLQ_SUFFIX) ? queue.slice(0, -DLQ_SUFFIX.length) : queue;
  return QUEUE_REDACTORS[base] ?? redactJobPayload;
}

/** Each worker instance refreshes `<prefix><instance>` (with a TTL) and joins the instance set. */
export const WORKER_HEARTBEAT_KEY_PREFIX = 'worker:heartbeat:';
export const WORKER_HEARTBEAT_SET = 'worker:heartbeats';
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;
