/**
 * Trip settings (docs/api-contracts-planning.md): who may change the crew's plan, and the two
 * reads that show what a change of dates or a cancellation would do before anyone commits to it.
 *
 * The plan-change rule decides how a member's edit reaches the crew's plan:
 * - `organiser_approves` (the default): a member proposes a change set, organisers apply it;
 * - `anyone`: a member's edit goes straight in, as an organiser's does (any organiser can undo or
 *   move it back);
 * - `organiser_only`: only organisers change the crew's plan; a member keeps their own personal
 *   tweaks and comments, and proposes nothing to the crew.
 */
import { z } from 'zod';

export const PLAN_CHANGE_RULES = ['organiser_approves', 'anyone', 'organiser_only'] as const;
export const planChangeRuleSchema = z.enum(PLAN_CHANGE_RULES);
export type PlanChangeRule = z.infer<typeof planChangeRuleSchema>;
export const DEFAULT_PLAN_CHANGE_RULE: PlanChangeRule = 'organiser_approves';

export function planChangeRuleOf(value: string | null | undefined): PlanChangeRule {
  return (PLAN_CHANGE_RULES as readonly string[]).includes(value ?? '')
    ? (value as PlanChangeRule)
    : DEFAULT_PLAN_CHANGE_RULE;
}

export interface PlanEditRights {
  /** Edits go straight into the crew's plan (`apply_plan_ops`). */
  readonly direct: boolean;
  /** Edits may go to the crew as a change set. */
  readonly propose: boolean;
}

/** What one person may do to the crew's plan under the trip's rule. */
export function planEditRights(input: {
  readonly member: boolean;
  readonly organiser: boolean;
  readonly rule: PlanChangeRule;
}): PlanEditRights {
  if (!input.member) return { direct: false, propose: false };
  if (input.organiser) return { direct: true, propose: true };
  switch (input.rule) {
    case 'anyone':
      return { direct: true, propose: true };
    case 'organiser_only':
      return { direct: false, propose: false };
    case 'organiser_approves':
      return { direct: false, propose: true };
  }
}

export const setPlanChangeRulePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  rule: planChangeRuleSchema,
});
export type SetPlanChangeRulePayload = z.infer<typeof setPlanChangeRulePayloadSchema>;
export const setPlanChangeRuleResultSchema = z.object({
  trip_id: z.uuid(),
  rule: planChangeRuleSchema,
  changed: z.boolean(),
});
export type SetPlanChangeRuleResult = z.infer<typeof setPlanChangeRuleResultSchema>;

/** What a dates change does to one booking: it moves, the supplier is asked, it is lost, or fine. */
export const DATES_IMPACT_KINDS = ['moves', 'ask', 'lost', 'fine'] as const;
export const datesImpactKindSchema = z.enum(DATES_IMPACT_KINDS);
export type DatesImpactKind = z.infer<typeof datesImpactKindSchema>;

export const datesImpactQuerySchema = z.object({
  start: z.iso.date(),
  end: z.iso.date(),
});

export const datesImpactResultSchema = z.object({
  trip_id: z.uuid(),
  from: z.object({ start: z.iso.date().nullable(), end: z.iso.date().nullable() }),
  to: z.object({ start: z.iso.date(), end: z.iso.date() }),
  /** Members free on every day of the new range, from their marked days (never their events). */
  free: z.object({
    user_ids: z.array(z.uuid()),
    total: z.number().int().nonnegative(),
  }),
  bookings: z.array(
    z.object({
      booking_id: z.uuid(),
      kind: z.string(),
      title: z.string(),
      starts_on: z.iso.date().nullable(),
      impact: datesImpactKindSchema,
      /** Last day it can be cancelled for free, when the terms say so. */
      free_cancel_until: z.iso.datetime({ offset: true }).nullable(),
      /** What would be kept back on cancelling, in the booking's currency (`lost` only). */
      kept_minor: z.number().int().nonnegative().nullable(),
      currency: z.string().length(3).nullable(),
    }),
  ),
  /** Stops of the plan on days the new range no longer has (they go back to Ideas). */
  stops_to_ideas: z.number().int().nonnegative(),
  /** Days whose stops shift with the dates (each keeps its day number). */
  days_moving: z.number().int().nonnegative(),
});
export type DatesImpactResult = z.infer<typeof datesImpactResultSchema>;

/** One line of what cancelling the trip does. */
export const CANCEL_CONSEQUENCE_KINDS = [
  'booking_refund',
  'booking_kept',
  'booking_ask',
  'boost_moves',
  'money_stays',
  'chat_stays',
] as const;
export const cancelConsequenceKindSchema = z.enum(CANCEL_CONSEQUENCE_KINDS);
export type CancelConsequenceKind = z.infer<typeof cancelConsequenceKindSchema>;

export const cancelSummaryResultSchema = z.object({
  trip_id: z.uuid(),
  cancellable: z.boolean(),
  /** Everyone who would be told (not already out). */
  told_count: z.number().int().nonnegative(),
  consequences: z.array(
    z.object({
      kind: cancelConsequenceKindSchema,
      booking_id: z.uuid().nullable(),
      title: z.string().nullable(),
      /** Refunded (`booking_refund`) or kept back (`booking_kept`), in `currency`. */
      amount_minor: z.number().int().nonnegative().nullable(),
      currency: z.string().length(3).nullable(),
      /** Open balances in the trip's money (`money_stays`). */
      open_balances: z.number().int().nonnegative().nullable(),
    }),
  ),
});
export type CancelSummaryResult = z.infer<typeof cancelSummaryResultSchema>;

export interface BookingTerms {
  /** The booking's local date (its start in the trip's zone), null when it has no date. */
  readonly startsOn: string | null;
  /** The last moment it can be cancelled for free, from the confirmation; null when unknown. */
  readonly freeCancelUntil: string | null;
}

/**
 * What new dates do to a booking: still inside them, it is fine; outside them it moves when it
 * can still be cancelled for free, is lost when free cancelling has passed, and otherwise the
 * guide asks the supplier (no deadline on record).
 */
export function datesImpactOf(
  booking: BookingTerms,
  range: { readonly start: string; readonly end: string },
  now: Date,
): DatesImpactKind {
  if (booking.startsOn === null) return 'fine';
  if (booking.startsOn >= range.start && booking.startsOn <= range.end) return 'fine';
  return cancelTermsOf(booking, now);
}

/** What cancelling a booking now gets back: all of it, nothing, or a question to the supplier. */
export function cancelTermsOf(
  booking: Pick<BookingTerms, 'freeCancelUntil'>,
  now: Date,
): 'moves' | 'lost' | 'ask' {
  if (booking.freeCancelUntil === null) return 'ask';
  return Date.parse(booking.freeCancelUntil) > now.getTime() ? 'moves' : 'lost';
}
