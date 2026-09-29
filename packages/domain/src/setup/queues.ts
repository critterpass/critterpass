/**
 * Trip setup job queues (docs/api-contracts-async.md §2.2, §2.3): their names, the overrides they
 * take on the catalogue's defaults, and what each does for the console's jobs panel. Recomputes are
 * stately (one queued and one running per trip, so a change during a run is never lost); the stale
 * calendar nudge runs hourly and acts on members whose local time is 09:00.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const SETUP_QUEUES = {
  windowRecompute: 'setup.window_recompute',
  budgetRecompute: 'setup.budget_recompute',
  availabilityAsk: 'setup.availability_ask',
  askReply: 'setup.ask_reply',
  askTimeout: 'availability_ask.timeout',
  calendarSync: 'calendar.sync',
  staleNudge: 'calendar.stale_nudge',
  fitCheck: 'ai.fit_check',
  lotteryRemind: 'setup.lottery_remind',
} as const;

export const SETUP_QUEUE_SPECS = {
  'setup.window_recompute': { policy: 'stately', notify: true },
  'setup.budget_recompute': { policy: 'stately', notify: true },
  'setup.availability_ask': { policy: 'exclusive', deadLetter: true, notify: true },
  'setup.ask_reply': { policy: 'exclusive', deadLetter: true, notify: true },
  'availability_ask.timeout': { policy: 'exclusive', deadLetter: true },
  'calendar.sync': { policy: 'exclusive', expireInSeconds: 5 * 60 },
  'calendar.stale_nudge': {
    policy: 'stately',
    retryLimit: 1,
    cron: { expr: '0 * * * *', tz: 'UTC' },
  },
  'ai.fit_check': { policy: 'stately', notify: true },
  'setup.lottery_remind': { policy: 'exclusive' },
} as const satisfies Record<string, Partial<QueueSpec>>;

/** The setup queues' full specs over the catalogue's defaults (passed in: no import cycle). */
export function setupQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof SETUP_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(SETUP_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof SETUP_QUEUE_SPECS, QueueSpec>;
}

export const SETUP_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof SETUP_QUEUE_SPECS, string>> = {
  'setup.window_recompute': "Recounts a trip's availability and its date window options",
  'setup.budget_recompute': "Recomputes a trip's anonymous budget band (debounced)",
  'setup.availability_ask': "Words the guide's private availability ask and sends it",
  'setup.ask_reply': 'Reads the intent of a written reply to an availability ask',
  'availability_ask.timeout': 'Falls back to the best partial week when an ask goes unanswered',
  'calendar.sync': "Reads one connected calendar's free/busy into date-level days",
  'calendar.stale_nudge': 'Nudges members whose calendar is missing or stale at 09:00 local',
  'ai.fit_check': "Checks a trip's must-dos against the dates and writes the guide's note",
  'setup.lottery_remind': "Reminds a must-do's owner before a lottery or booking deadline",
};
