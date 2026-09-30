/**
 * The ChangeSet ops a dropout or an unattributed objection option proposes (3f-7, 3f-4). They are
 * cost and booking changes, not plan edits: nothing moves until the change set is applied, and a
 * third-party stay is never modified by us (it becomes a "change the booking on {supplier}" link).
 * Every amount is the cost engine's; the model never writes one.
 */
import { z } from 'zod';

const minor = z.string().regex(/^-?\d+$/u);

export const PROPOSAL_OP_KINDS = [
  'release_room_bed',
  'move_guest',
  'resplit_component',
  'withdraw_reminder_entry',
  'cancel_supplier_item',
  'change_stay_booking',
  'remove_participant_from_item',
  'apply_crew_option',
] as const;
export type ProposalOpKind = (typeof PROPOSAL_OP_KINDS)[number];

export const proposalOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('release_room_bed'),
    stay_id: z.string(),
    room_key: z.string(),
    occupants_before: z.array(z.string()),
  }),
  z.object({
    op: z.literal('move_guest'),
    stay_id: z.string(),
    uid: z.uuid(),
    from_room: z.string(),
    to_room: z.string(),
  }),
  z.object({
    op: z.literal('resplit_component'),
    component_id: z.string(),
    ways_before: z.number().int().min(1),
    ways_after: z.number().int().min(0),
  }),
  // Lotteries are reminders: only the member's own reminder entry is withdrawn.
  z.object({ op: z.literal('withdraw_reminder_entry'), component_id: z.string(), uid: z.uuid() }),
  // Executed by the supplier layer when the change set is applied, never before.
  z.object({
    op: z.literal('cancel_supplier_item'),
    supplier_order_id: z.uuid(),
    seats_before: z.number().int().min(1),
    seats_after: z.number().int().min(0),
  }),
  z.object({
    op: z.literal('change_stay_booking'),
    booking_id: z.uuid(),
    supplier: z.string(),
  }),
  z.object({ op: z.literal('remove_participant_from_item'), stable_id: z.uuid(), uid: z.uuid() }),
  z.object({
    op: z.literal('apply_crew_option'),
    option_id: z.string(),
    kind: z.enum(['cheaper_room', 'skip_day', 'cheaper_stay']),
    delta_minor: minor,
  }),
]);
export type ProposalOp = z.infer<typeof proposalOpSchema>;
export const proposalOpsSchema = z.array(proposalOpSchema).min(1).max(200);

/** Per member, before and after a dropout, in the trip currency (minor units as strings). */
export const memberResplitSchema = z.object({
  uid: z.uuid(),
  before_minor: minor,
  after_minor: minor,
  delta_minor: minor,
  display_delta_minor: minor,
});
export type MemberResplitWire = z.infer<typeof memberResplitSchema>;
