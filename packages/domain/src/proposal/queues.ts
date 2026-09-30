/**
 * Proposal job queues (docs/api-contracts-async.md §2): the per-recipient version fan-out, reply
 * intent, the dropout re-split, the organiser's suggestions, the reply-by and follow-up crons and
 * the waitlist hand-off after a seat frees.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const PROPOSAL_QUEUES = {
  versions: 'ai.proposal_versions',
  rsvpIntent: 'ai.rsvp_intent',
  dropout: 'trip.dropout',
  suggestions: 'proposal.suggestions',
  replyBy: 'proposal.reply_by',
  followup: 'followup.deliver',
  waitlist: 'proposal.waitlist',
} as const;

export const PROPOSAL_QUEUE_SPECS = {
  'ai.proposal_versions': { policy: 'exclusive', retryLimit: 3, expireInSeconds: 10 * 60 },
  'ai.rsvp_intent': { policy: 'exclusive', retryLimit: 2 },
  'trip.dropout': { policy: 'exclusive', retryLimit: 3, deadLetter: true },
  'proposal.suggestions': { policy: 'exclusive', retryLimit: 2 },
  'proposal.reply_by': {
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 4 * 60,
    keepCompletedSeconds: 3600,
    cron: { expr: '*/5 * * * *', tz: 'UTC' },
  },
  'followup.deliver': {
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 55,
    keepCompletedSeconds: 3600,
    cron: { expr: '* * * * *', tz: 'UTC' },
  },
  'proposal.waitlist': { policy: 'exclusive', retryLimit: 3 },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function proposalQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof PROPOSAL_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(PROPOSAL_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof PROPOSAL_QUEUE_SPECS, QueueSpec>;
}

export const PROPOSAL_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof PROPOSAL_QUEUE_SPECS, string>
> = {
  'ai.proposal_versions': "Writes one recipient's personal proposal version, shared on failure",
  'ai.rsvp_intent': 'Reads a free-text reply to a proposal as in, maybe, out or a question',
  'trip.dropout': 'Builds the re-split change set after a member declines the trip',
  'proposal.suggestions': "Recomputes the organiser's reply suggestions (resend, offers)",
  'proposal.reply_by': 'Reminds a day before reply-by and locks proposals at reply-by',
  'followup.deliver': 'Delivers follow-ups and resends that are due',
  'proposal.waitlist': 'Offers a seat freed by a dropout to the next person waiting',
};
