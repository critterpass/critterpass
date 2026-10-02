/**
 * Help and SOS job queues (docs/api-contracts-async.md §2.2): the SOS orchestrator (fan-out first,
 * then the summary and the escalation timer; ten fast retries), the escalation check, the
 * responders' walking ETAs, the Help share's end-of-window notice and the retention sweep.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const SAFETY_QUEUES = {
  sosOrchestrate: 'sos.orchestrate',
  sosEscalate: 'sos.escalate',
  sosResponderEta: 'sos.responder_eta',
  helpShareExpire: 'help.share_expire',
  helpShareEnding: 'help.share_ending',
  retention: 'safety.retention',
} as const;

export const SAFETY_QUEUE_SPECS = {
  'sos.orchestrate': {
    policy: 'exclusive',
    retryLimit: 10,
    retryDelay: 1,
    retryBackoff: false,
    expireInSeconds: 60,
    deadLetter: true,
    notify: true,
  },
  'sos.escalate': { policy: 'exclusive', retryLimit: 5, retryDelay: 2, notify: true },
  'sos.responder_eta': { policy: 'exclusive', retryLimit: 1, expireInSeconds: 50, notify: true },
  'help.share_expire': { policy: 'exclusive', retryLimit: 3, notify: true },
  'help.share_ending': { policy: 'exclusive', retryLimit: 3 },
  'safety.retention': {
    policy: 'singleton',
    retryLimit: 3,
    cron: { expr: '40 3 * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function safetyQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof SAFETY_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(SAFETY_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof SAFETY_QUEUE_SPECS, QueueSpec>;
}

export const SAFETY_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof SAFETY_QUEUE_SPECS, string>> =
  {
    'sos.orchestrate':
      'Alerts the crew about an SOS first, then words its summary and arms escalation',
    'sos.escalate': 'Pushes an unanswered SOS again and prompts the sender to call',
    'sos.responder_eta': "Recounts responders' walking ETAs to an SOS every minute",
    'help.share_expire': "Announces the end of a Help share's one-hour window",
    'help.share_ending': 'Reminds the sharer ten minutes before their location share ends',
    'safety.retention': 'Deletes SOS health notes and threads after 90 days, sessions after a year',
  };

export const sosJobSchema = z.object({
  sos_id: z.uuid(),
  /** The `sos.triggered` event the pushes route from (the orchestrator's fan-out). */
  event_id: z.uuid().optional(),
});
export type SosJob = z.infer<typeof sosJobSchema>;

export const helpShareExpireJobSchema = z.object({ share_id: z.uuid() });

/** How long before a Help share ends its sharer is reminded (stop it, or share for longer). */
export const HELP_SHARE_ENDING_LEAD_MIN = 10;

export const helpShareEndingJobSchema = z.object({
  share_id: z.uuid(),
  /** The end this reminder is for: an extend or a stop since then leaves it silent. */
  ends_at: z.iso.datetime({ offset: true }),
});
export type HelpShareEndingJob = z.infer<typeof helpShareEndingJobSchema>;
export type HelpShareExpireJob = z.infer<typeof helpShareExpireJobSchema>;
