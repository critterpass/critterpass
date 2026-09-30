/**
 * A disruption's classified rows as stored on `disruptions.actions` and read by 3k-5. Ids are
 * deterministic (`<kind>:<target>`) so a re-trigger can diff old rows against new ones. `facts`
 * hold the only times, names and numbers any copy for the row may show.
 */
import { z } from 'zod';

import { DECIDER_POLICIES } from '../guide-actions/kinds';
import { DISRUPTION_ACTION_CLASSES, disruptionActionKindSchema } from './action-kinds';

export const DISRUPTION_ACTION_STATES = [
  // plan and system rows the guide runs
  'planned',
  'running',
  'done',
  'failed',
  'undone',
  // rows waiting on the crew
  'needs_yes',
  'approved',
  'kept',
  // vendor rows: a draft, then the desk's send, then the vendor's answer
  'draft_ready',
  'sent',
  'confirmed',
  'declined',
  'no_answer',
  // a plan row that runs once the vendor confirms
  'waiting_vendor',
  // a link the traveller follows themselves
  'link',
  // re-trigger: no longer needed
  'withdrawn',
] as const;
export const disruptionActionStateSchema = z.enum(DISRUPTION_ACTION_STATES);
export type DisruptionActionState = z.infer<typeof disruptionActionStateSchema>;

const factValue = z.union([z.string().max(120), z.number()]);
export type DisruptionFacts = Readonly<Record<string, string | number>>;

export const disruptionDeciderSchema = z.object({
  policy: z.enum(DECIDER_POLICIES),
  threshold: z.number().int().min(1),
  tie_breaker: z.enum(['organiser']).nullable(),
  closes_at: z.iso.datetime({ offset: true }),
});
export type DisruptionDecider = z.infer<typeof disruptionDeciderSchema>;

export const disruptionActionSchema = z.object({
  id: z.string().min(1).max(120),
  kind: disruptionActionKindSchema,
  class: z.enum(DISRUPTION_ACTION_CLASSES),
  state: disruptionActionStateSchema,
  autonomous: z.boolean(),
  reversible: z.boolean(),
  cost_delta_minor: z.number().int(),
  booking_impact: z.boolean(),
  affected_user_ids: z.array(z.uuid()).max(64),
  item_stable_id: z.uuid().nullable(),
  provider_id: z.uuid().nullable(),
  /** The row this one waits on (a retime waiting on the vendor's confirmation). */
  depends_on: z.string().nullable(),
  facts: z.record(z.string(), factValue),
  decider: disruptionDeciderSchema.nullable(),
  guide_action_id: z.uuid().nullable(),
  vendor_message_id: z.uuid().nullable(),
  decided_by: z.uuid().nullable(),
  /** The copy for the row: the guide's wording checked against `facts`, or the template. */
  label: z.string().max(160),
});
export type DisruptionAction = z.infer<typeof disruptionActionSchema>;

export const disruptionActionsSchema = z.array(disruptionActionSchema).max(40);

/** Who a disruption touches (`disruptions.affected`). */
export const disruptionAffectedSchema = z.object({
  traveller_ids: z.array(z.uuid()).max(64),
  item_stable_ids: z.array(z.uuid()).max(64),
  unaffected_ids: z.array(z.uuid()).max(64),
});
export type DisruptionAffected = z.infer<typeof disruptionAffectedSchema>;
