/**
 * What a disruption's rows can be (3k-5). Every row has a class that fixes what it may ever do:
 * - `plan`: a guide ChangeSet on the trip plan, run by the guide-actions executor under the
 *   autonomy policy (on its own only when free, reversible and only the disrupted members' items);
 * - `system`: derived own data the guide refreshes by itself (leave-bys, the Live Activity, a
 *   briefing line, a "nothing changes for you" note);
 * - `vendor`: a message to a driver, villa or restaurant, only ever a draft until a member says
 *   yes, sent by the ops desk;
 * - `link`: something only the traveller can do (rebook with the airline), shown as a link.
 */
import { z } from 'zod';

export const DISRUPTION_ACTION_KINDS = [
  'retime_item',
  'reschedule_pickup',
  'skip_item',
  'recompute_leave_by',
  'refresh_live_activity',
  'insert_briefing',
  'notify_unaffected',
  'contact_vendor',
  'rebook_flight',
] as const;
export const disruptionActionKindSchema = z.enum(DISRUPTION_ACTION_KINDS);
export type DisruptionActionKind = z.infer<typeof disruptionActionKindSchema>;

export const DISRUPTION_ACTION_CLASSES = ['plan', 'system', 'vendor', 'link'] as const;
export type DisruptionActionClass = (typeof DISRUPTION_ACTION_CLASSES)[number];

export const DISRUPTION_ACTION_CLASS: Readonly<
  Record<DisruptionActionKind, DisruptionActionClass>
> = {
  retime_item: 'plan',
  reschedule_pickup: 'plan',
  skip_item: 'plan',
  recompute_leave_by: 'system',
  refresh_live_activity: 'system',
  insert_briefing: 'system',
  notify_unaffected: 'system',
  contact_vendor: 'vendor',
  rebook_flight: 'link',
};

/** Kinds that may never run without a member's yes, whatever the policy says. */
export function neverAutonomous(kind: DisruptionActionKind): boolean {
  const cls = DISRUPTION_ACTION_CLASS[kind];
  return cls === 'vendor' || cls === 'link';
}
