/**
 * The leave-by alarm's AlarmKit presentation (5b-3): AlarmKit owns the activity and its state
 * (countdown, paused, alerting); the widget extension only draws it from `CPAlarmMetadata`, which
 * names the leave-by. There is no server ContentState: a moved alarm is re-synced by a background
 * push and rescheduled on the phone (modules/cp-alarm).
 */
import { z } from 'zod';

export const LA_ALARM_MODES = ['countdown', 'paused', 'alerting'] as const;

export const alarmLaMetadataSchema = z.object({ leave_by_id: z.uuid() });
export type AlarmLaMetadata = z.infer<typeof alarmLaMetadataSchema>;

export function buildAlarmLaMetadata(leaveById: string): AlarmLaMetadata {
  return { leave_by_id: leaveById };
}
