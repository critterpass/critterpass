/**
 * Plan presence on `trip_presence:{trip_id}` (docs/api-contracts-async.md §1): `here{screen, day}`,
 * `cursor{anchor}` and `typing`, published by clients through the publish proxy at most 5 Hz. The
 * wire shapes are the namespace's own publish rules (../realtime/namespaces.ts); this module names
 * the plan screens and builds the anchors so every plan surface speaks the same ids. Anchors point
 * at elements (a plan item's stable id, a day number, a poll option), never at coordinates, and no
 * payload carries a C3 field.
 */
import { type z } from 'zod';

import { rtCursorPublishSchema, rtHerePublishSchema } from '../realtime/namespaces';

export const PLAN_PRESENCE_SCREENS = ['plan', 'day', 'timeline', 'review', 'decide'] as const;
export type PlanPresenceScreen = (typeof PLAN_PRESENCE_SCREENS)[number];

export const PLAN_ANCHOR_KINDS = ['plan_item', 'plan_day', 'poll_option', 'comment'] as const;
export type PlanAnchorKind = (typeof PLAN_ANCHOR_KINDS)[number];

export interface PlanAnchor {
  readonly kind: PlanAnchorKind;
  readonly id: string;
}

/** `plan_item:<stable_id>`, `plan_day:<n>`, `poll_option:<id>`, `comment:<id>`. */
export function planAnchor(kind: PlanAnchorKind, id: string): string {
  return `${kind}:${id}`;
}

export function parsePlanAnchor(anchor: string | null): PlanAnchor | null {
  if (anchor === null) return null;
  const at = anchor.indexOf(':');
  const kind = anchor.slice(0, at);
  const id = anchor.slice(at + 1);
  if (at <= 0 || id.length === 0) return null;
  return (PLAN_ANCHOR_KINDS as readonly string[]).includes(kind)
    ? { kind: kind as PlanAnchorKind, id }
    : null;
}

export const planHerePresenceSchema = rtHerePublishSchema.refine(
  (payload) => (PLAN_PRESENCE_SCREENS as readonly string[]).includes(payload.data.screen),
  { message: 'not a plan screen' },
);
export type PlanHerePresence = z.infer<typeof planHerePresenceSchema>;

export const planCursorPresenceSchema = rtCursorPublishSchema.refine(
  (payload) => payload.data.anchor === null || parsePlanAnchor(payload.data.anchor) !== null,
  { message: 'not a plan anchor' },
);
export type PlanCursorPresence = z.infer<typeof planCursorPresenceSchema>;
