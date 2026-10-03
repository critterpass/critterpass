/**
 * GuideAction kinds (docs/data-model.md §3.3 `guide_actions.kind`; docs/product-decisions.md,
 * approval authority). A plan kind is one guide-authored ChangeSet on the trip plan, reversible through its
 * inverse ChangeSet (services/worker/src/guide-actions/inverse-registry.ts). A forbidden kind is a
 * side effect the guide may only ever draft for a person to confirm (spending, booking, contacting
 * a vendor, sharing private data, calling anyone): the autonomy decider never lets one run.
 */
import { z } from 'zod';

import type { ChangeSetOpKind } from '../plan/change-set-ops';

export const PLAN_ACTION_KINDS = [
  'move_item',
  'retime_item',
  'swap_item',
  'add_item',
  'remove_item',
  'reschedule_pickup',
  /** A plan check fix applied by an organiser in one tap; undone from the trip feed. */
  'check_fix',
] as const;
export type PlanActionKind = (typeof PLAN_ACTION_KINDS)[number];

export const FORBIDDEN_ACTION_KINDS = [
  'spend_money',
  'make_booking',
  'contact_vendor',
  'share_private_data',
  'call_someone',
] as const;
export type ForbiddenActionKind = (typeof FORBIDDEN_ACTION_KINDS)[number];

export const GUIDE_ACTION_KINDS = [...PLAN_ACTION_KINDS, ...FORBIDDEN_ACTION_KINDS] as const;
export const guideActionKindSchema = z.enum(GUIDE_ACTION_KINDS);
export type GuideActionKind = z.infer<typeof guideActionKindSchema>;

export function isPlanActionKind(kind: string): kind is PlanActionKind {
  return (PLAN_ACTION_KINDS as readonly string[]).includes(kind);
}

/** Every kind that is not a registered plan kind, unknown strings included, is forbidden. */
export function isForbiddenActionKind(kind: string): boolean {
  return !isPlanActionKind(kind);
}

/** The ChangeSet op kinds each plan action may carry; anything else is a malformed action. */
export const PLAN_ACTION_OPS: Readonly<Record<PlanActionKind, readonly ChangeSetOpKind[]>> = {
  move_item: ['move'],
  retime_item: ['retime'],
  swap_item: ['swap'],
  add_item: ['add'],
  remove_item: ['remove'],
  reschedule_pickup: ['retime', 'move'],
  check_fix: ['retime', 'move', 'swap', 'add', 'remove'],
};

/** The approval sources a change set may have, plus `self` for a personal change. */
export const DECIDER_POLICIES = [
  'self',
  'organiser',
  'any_affected',
  'majority_of_affected',
  'threshold_n',
] as const;
export type DeciderPolicy = (typeof DECIDER_POLICIES)[number];
