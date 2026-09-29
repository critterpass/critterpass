/**
 * Money job queues (docs/api-contracts-async.md §2.2): the receipt parse (one per receipt), the
 * daily auto-confirm of payments marked paid a week ago (04:00 Singapore), and the re-rate of a
 * crew's ledger after its settlement currency changes (one per crew at a time).
 */
import type { QueueSpec } from '../jobs/catalogue';

export const MONEY_QUEUES = {
  receipt: 'ai.receipt',
  autoconfirm: 'money.autoconfirm',
  rerate: 'money.rerate',
} as const;

/** A payment marked paid confirms itself after this many days unless the payee disputes it. */
export const PAYMENT_AUTOCONFIRM_DAYS = 7;
/** One nudge per payment pair a day, one "remind everyone" per trip a day. */
export const NUDGE_INTERVAL_HOURS = 24;
export const REMIND_ALL_INTERVAL_HOURS = 24;

export const MONEY_QUEUE_SPECS = {
  'ai.receipt': { policy: 'exclusive', retryLimit: 2, deadLetter: true, notify: true },
  'money.autoconfirm': {
    policy: 'stately',
    retryLimit: 2,
    cron: { expr: '0 4 * * *', tz: 'Asia/Singapore' },
  },
  'money.rerate': { policy: 'stately', deadLetter: true, notify: true },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function moneyQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof MONEY_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(MONEY_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof MONEY_QUEUE_SPECS, QueueSpec>;
}

export const MONEY_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof MONEY_QUEUE_SPECS, string>> = {
  'ai.receipt': 'Reads a scanned receipt into validated lines and split suggestions',
  'money.autoconfirm': 'Confirms payments marked paid a week ago that nobody disputed',
  'money.rerate': "Re-rates a crew's ledger into its new settlement currency",
};
