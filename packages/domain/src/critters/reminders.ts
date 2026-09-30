/**
 * Conditional reminders (`reminders.condition`): a reminder fires only while its condition still
 * holds when its timer comes due. The worker evaluates each kind; this module owns the shapes and
 * the legendary lead time (a month before the window, at 09:00 in the traveller's zone).
 */
import { z } from 'zod';

export const LEGENDARY_REMINDER_LEAD_DAYS = 30;

export const reminderConditionSchema = z.discriminatedUnion('kind', [
  /** A legendary window: still opening on the stored start, and the form still unfound. */
  z.object({
    kind: z.literal('window_active_not_found'),
    window_id: z.uuid(),
    form_id: z.uuid(),
    window_start: z.iso.date(),
    lead_days: z.number().int().min(0),
    tz: z.string(),
  }),
  /** A quiet window at a POI (3l-5 "Remind me"): the forecast still calls that hour quiet. */
  z.object({
    kind: z.literal('quiet_window'),
    poi_id: z.uuid(),
    at: z.iso.datetime({ offset: true }),
  }),
  /** The crew is planning again (a new trip exists in the crew since the reminder was set). */
  z.object({
    kind: z.literal('crew_planning_again'),
    crew_id: z.uuid(),
    since: z.iso.datetime({ offset: true }),
  }),
]);
export type ReminderCondition = z.infer<typeof reminderConditionSchema>;
export type ReminderConditionKind = ReminderCondition['kind'];

function addDays(localDate: string, days: number): string {
  return new Date(Date.parse(`${localDate}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * The local date a legendary reminder fires: a month before the window opens, or tomorrow when
 * that date has already passed (a window less than a month away).
 */
export function legendaryReminderFireDate(windowStart: string, today: string): string {
  const lead = addDays(windowStart, -LEGENDARY_REMINDER_LEAD_DAYS);
  return lead > today ? lead : addDays(today, 1);
}
