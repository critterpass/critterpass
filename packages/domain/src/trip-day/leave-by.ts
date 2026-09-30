/**
 * Leave-by (docs/product-decisions.md, leave-by rule): the wire shapes the worker, the api and the
 * apps share. `leave_at` = item start (or pickup) − travel − buffer, in the item's zone; the alarm
 * rings `lead_min` before it for members who are not up, with one snooze.
 */
import { z } from 'zod';

export const LEAVE_BY_STATES = [
  'scheduled',
  'window',
  'alerting',
  'departed',
  'cancelled',
] as const;
export const leaveByStateSchema = z.enum(LEAVE_BY_STATES);
export type LeaveByState = z.infer<typeof leaveByStateSchema>;

export const DEFAULT_LEAVE_BY_BUFFER_MIN = 10;
export const DEFAULT_ALARM_LEAD_MIN = 10;
export const MAX_LEAVE_BY_BUFFER_MIN = 120;

export const alarmPolicySchema = z.object({
  lead_min: z.number().int().min(0).max(60),
  only_if_not_up: z.boolean(),
  snooze_limit: z.number().int().min(0).max(3),
});
export type AlarmPolicy = z.infer<typeof alarmPolicySchema>;

export const DEFAULT_ALARM_POLICY: AlarmPolicy = {
  lead_min: DEFAULT_ALARM_LEAD_MIN,
  only_if_not_up: true,
  snooze_limit: 1,
};

/** One routed (or estimated) hop from where the member is to the item or pickup point. */
export const leaveByLegSchema = z.object({
  kind: z.enum(['route', 'pickup', 'none']),
  minutes: z.number().int().nonnegative(),
  distance_m: z.number().int().nonnegative().nullable(),
  mode: z.string().nullable(),
  source: z.enum(['mapbox', 'valhalla', 'straight_line', 'pickup', 'none']),
  /** True when live or predicted traffic informed the minutes. */
  traffic: z.boolean(),
  estimate: z.boolean(),
});
export type LeaveByLeg = z.infer<typeof leaveByLegSchema>;

/** Where the crew is picked up (a transfer booking), shown as "Pickup at the villa gate, 03:30". */
export const leaveByPickupSchema = z.object({
  at: z.iso.datetime({ offset: true }),
  place: z.string().max(200).nullable(),
  booking_id: z.uuid().nullable(),
});
export type LeaveByPickup = z.infer<typeof leaveByPickupSchema>;

export const setLeaveByBufferPayloadSchema = z.object({
  leave_by_id: z.uuid(),
  buffer_min: z.number().int().min(0).max(MAX_LEAVE_BY_BUFFER_MIN),
});
export type SetLeaveByBufferPayload = z.infer<typeof setLeaveByBufferPayloadSchema>;

export const snoozeLeaveByPayloadSchema = z.object({
  leave_by_id: z.uuid(),
  /** The device's own count after this snooze; the server keeps the higher of the two. */
  count: z.number().int().min(1).max(20).optional(),
});
export type SnoozeLeaveByPayload = z.infer<typeof snoozeLeaveByPayloadSchema>;

export const ALARM_STATES = ['scheduled', 'alerting', 'snoozed', 'stopped', 'cancelled'] as const;
export const alarmStateSchema = z.enum(ALARM_STATES);
export type AlarmState = z.infer<typeof alarmStateSchema>;

export const mirrorAlarmStatePayloadSchema = z.object({
  device_id: z.uuid(),
  leave_by_id: z.uuid(),
  state: alarmStateSchema,
  fire_at: z.iso.datetime({ offset: true }),
  os_alarm_id: z.string().min(1).max(128).optional(),
});
export type MirrorAlarmStatePayload = z.infer<typeof mirrorAlarmStatePayloadSchema>;

export const reportRunningLatePayloadSchema = z
  .object({
    trip_id: z.uuid(),
    item_id: z.uuid().optional(),
    meetup_id: z.uuid().optional(),
    minutes: z.number().int().min(1).max(180),
  })
  .refine((value) => (value.item_id === undefined) !== (value.meetup_id === undefined), {
    message: 'name exactly one of item_id or meetup_id',
  });
export type ReportRunningLatePayload = z.infer<typeof reportRunningLatePayloadSchema>;
