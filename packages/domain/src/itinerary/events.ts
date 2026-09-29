/**
 * Drafting domain events (docs/api-contracts.md §4.6). Payloads carry ids, day numbers and reason
 * chips only: never a note, a place name or a price.
 */
import { z } from 'zod';

import { REDRAFT_REASONS } from './commands';

export const DRAFT_EVENT_TYPES = [
  'draft.requested',
  'draft.ready',
  'draft.failed',
  'draft.cancelled',
  'draft.version_restored',
  'redraft.requested',
  'redraft.delivered',
  'redraft.kept',
  'redraft.reverted',
] as const;
export type DraftEventType = (typeof DRAFT_EVENT_TYPES)[number];

const job = z.object({ trip_id: z.uuid(), job_id: z.uuid() });
const redraft = z.object({ trip_id: z.uuid(), redraft_id: z.uuid() });

export const DRAFT_EVENT_PAYLOADS = {
  // Aggregate is the trip; the organiser who asked is the actor.
  'draft.requested': job,
  // Pushed to the organiser who asked, when the app is not in the foreground.
  'draft.ready': job.extend({ version_id: z.uuid(), user_id: z.uuid() }),
  'draft.failed': job,
  'draft.cancelled': job,
  'draft.version_restored': z.object({
    trip_id: z.uuid(),
    version_id: z.uuid(),
    from_version_id: z.uuid(),
  }),
  'redraft.requested': redraft.extend({
    day_no: z.number().int().positive(),
    reasons: z.array(z.enum(REDRAFT_REASONS)),
    free: z.boolean(),
  }),
  'redraft.delivered': redraft.extend({ outcome: z.enum(['changed', 'identical']) }),
  'redraft.kept': redraft.extend({ version_id: z.uuid() }),
  'redraft.reverted': redraft,
} as const satisfies Record<DraftEventType, z.ZodType>;
