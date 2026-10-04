/**
 * Bookings job queues (docs/api-contracts-async.md §2.2, §2.3): reading forwarded mail and pasted
 * or scanned confirmations into candidates, the daily mailbox scan, flight status events and
 * schedule polls, the boarding ping, the free-cancellation reminder and the hourly sweep that ends
 * status watches a day after landing.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const BOOKINGS_QUEUES = {
  mailParse: 'mail.parse',
  importParse: 'import.parse',
  mailboxScan: 'mailbox.scan',
  flightEvent: 'flight.event',
  flightPoll: 'flight.poll',
  boardingSchedule: 'boarding.schedule',
  deadlineReminder: 'booking.deadline_reminder',
  watchSweep: 'flight.watch_sweep',
} as const;

export const BOOKINGS_QUEUE_SPECS = {
  'mail.parse': { policy: 'exclusive', retryLimit: 3, deadLetter: true, notify: true },
  'import.parse': { policy: 'exclusive', retryLimit: 3, notify: true },
  // Hourly: each connection is scanned once a day in its owner's 07:00 hour (and on connect).
  // `exclusive`: the sweep picks due mailboxes without a lock and marks them scanned only when it
  // finishes, so one waiting-or-running sweep (and one scan per connection key) is what prevents
  // the same mailbox being scanned twice.
  'mailbox.scan': {
    policy: 'exclusive',
    retryLimit: 2,
    expireInSeconds: 30 * 60,
    cron: { expr: '5 * * * *', tz: 'UTC' },
  },
  'flight.event': { policy: 'exclusive', retryLimit: 5, deadLetter: true, notify: true },
  'flight.poll': { policy: 'exclusive', retryLimit: 3 },
  'boarding.schedule': { policy: 'exclusive', retryLimit: 3, notify: true },
  'booking.deadline_reminder': { policy: 'exclusive', retryLimit: 3 },
  'flight.watch_sweep': {
    policy: 'stately',
    retryLimit: 2,
    cron: { expr: '20 * * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function bookingsQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof BOOKINGS_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(BOOKINGS_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof BOOKINGS_QUEUE_SPECS, QueueSpec>;
}

export const BOOKINGS_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof BOOKINGS_QUEUE_SPECS, string>
> = {
  'mail.parse': 'Reads a forwarded or scanned-in email into a booking candidate',
  'import.parse': 'Reads a pasted or scanned confirmation into a booking candidate',
  'mailbox.scan': "Checks connected mailboxes for new confirmations in their owner's morning",
  'flight.event': 'Applies a flight status change: segments, pushes, landed and disruption events',
  'flight.poll': 'Checks a watched flight against its schedule at T−24 h, T−6 h and T−3 h',
  'boarding.schedule': 'Pings a traveller when boarding opens',
  'booking.deadline_reminder': 'Reminds the owner a day before free cancellation ends',
  'flight.watch_sweep': 'Ends flight status watches a day after landing',
};
