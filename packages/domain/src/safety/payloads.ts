/**
 * Help and SOS wire shapes (docs/api-contracts-trip.md §4.12, docs/api-contracts-async.md §1.2):
 * command payloads and results, and the `sos:{id}` / `user:#uid` realtime publications. A position
 * appears only in a fix (C3, never in an event or a synced row).
 */
import { z } from 'zod';

import { sosResponseStateSchema } from './events';
import {
  HELP_SHARE_MAX_AHEAD_MIN,
  SOS_HEALTH_NOTES_MAX,
  SOS_MESSAGE_MAX,
  SOS_TEXT_MAX,
} from './share-policy';

export const SOS_PRESETS = ['fell', 'lost', 'need_ride'] as const;
export const sosPresetSchema = z.enum(SOS_PRESETS);
export type SosPreset = z.infer<typeof sosPresetSchema>;

export const helpFixSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  acc: z.number().min(0).max(100_000),
  at: z.iso.datetime({ offset: true }),
});
export type HelpFix = z.infer<typeof helpFixSchema>;

const ttl = z.number().int().min(1).max(HELP_SHARE_MAX_AHEAD_MIN);

export const startHelpSharePayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  reason: z.literal('help'),
  ttl_min: ttl.optional(),
  /** Client-chosen, so an offline start and a later stop agree on the session. */
  session_id: z.uuid().optional(),
  place_label: z.string().trim().min(1).max(120).optional(),
});
export type StartHelpSharePayload = z.infer<typeof startHelpSharePayloadSchema>;
export interface StartHelpShareResult {
  readonly session_id: string;
  readonly share_id: string;
  readonly ends_at: string;
  /** The crew map share was paused: Help shows the "sharing anyway, for Help" copy. */
  readonly overrode_pause: boolean;
}

export const stopHelpSharePayloadSchema = z.strictObject({ share_id: z.uuid() });
export type StopHelpSharePayload = z.infer<typeof stopHelpSharePayloadSchema>;
export const extendHelpSharePayloadSchema = z.strictObject({
  share_id: z.uuid(),
  ttl_min: ttl.optional(),
});
export type ExtendHelpSharePayload = z.infer<typeof extendHelpSharePayloadSchema>;
export interface HelpShareWindowResult {
  readonly share_id: string;
  readonly ends_at: string;
}

export const requestOpsClinicCallPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** A Help session or SOS; absent = a new Help session is opened for the request. */
  session_id: z.uuid().optional(),
  facility_id: z.uuid().optional(),
  /** The sender said yes to ops passing their insurance details to the clinic. */
  share_insurance: z.boolean(),
  /** The exact consent text the sender approved. */
  text_shown: z.string().trim().min(1).max(4000),
});
export type RequestOpsClinicCallPayload = z.infer<typeof requestOpsClinicCallPayloadSchema>;
export interface RequestOpsClinicCallResult {
  readonly session_id: string;
  readonly task_id: string;
  /** A policy on file went to the desk with the sender's consent. */
  readonly insurance_shared: boolean;
}

export const triggerSosPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** Client-chosen, so a queued resolve can name the incident before the server has seen it. */
  sos_id: z.uuid().optional(),
  text: z.string().trim().min(1).max(SOS_TEXT_MAX).optional(),
  preset: sosPresetSchema.optional(),
  fix: helpFixSchema.optional(),
  place_label: z.string().trim().min(1).max(120).optional(),
  health_notes: z.string().trim().min(1).max(SOS_HEALTH_NOTES_MAX).optional(),
  /** Server minus device clock (ms), as the app last measured it. */
  clock_offset_ms: z.number().int().optional(),
  /** SEND NOW on the "didn't send" prompt: the stale SOS this one replaces, sent on purpose. */
  confirm_of: z.uuid().optional(),
});
export type TriggerSosPayload = z.infer<typeof triggerSosPayloadSchema>;
export interface TriggerSosResult {
  readonly sos_id: string;
  /** `alerting`: the crew is being told. `stale`: it waited too long, nobody was alerted. */
  readonly status: 'alerting' | 'stale';
  /** When the sender pressed SEND (server clock). */
  readonly sent_at: string;
  /** SOS this sender raised today, this one included (the app confirms before the next). */
  readonly today_count: number;
  readonly notes_saved: boolean;
}

export const respondSosPayloadSchema = z.strictObject({
  sos_id: z.uuid(),
  state: sosResponseStateSchema,
});
export type RespondSosPayload = z.infer<typeof respondSosPayloadSchema>;

export const sendSosMessagePayloadSchema = z.strictObject({
  sos_id: z.uuid(),
  message_id: z.uuid().optional(),
  body: z.string().trim().min(1).max(SOS_MESSAGE_MAX),
});
export type SendSosMessagePayload = z.infer<typeof sendSosMessagePayloadSchema>;

export const resolveSosPayloadSchema = z.strictObject({
  sos_id: z.uuid(),
  note: z.string().trim().min(1).max(SOS_TEXT_MAX).optional(),
  false_alarm: z.boolean().optional(),
});
export type ResolveSosPayload = z.infer<typeof resolveSosPayloadSchema>;
export interface ResolveSosResult {
  readonly sos_id: string;
  readonly status: 'resolved';
  /** The crew had been alerted (so they get the all-clear). */
  readonly alerted: boolean;
}

// ---------------------------------------------------------------------------------------------
// Realtime: `sos:{id}` and `user:#uid`.

export const SOS_STEP_KEYS = ['sent', 'location_live', 'ops_clinic', 'insurance'] as const;
export const sosStepKeySchema = z.enum(SOS_STEP_KEYS);
export type SosStepKey = z.infer<typeof sosStepKeySchema>;

export const sosStepSchema = z.object({
  state: z.enum(['pending', 'done']),
  at: z.iso.datetime({ offset: true }).optional(),
  /** `sent`: how many crewmates were alerted. */
  n: z.number().int().min(0).optional(),
});
export type SosStep = z.infer<typeof sosStepSchema>;

export const sosResponseSchema = z.object({
  state: sosResponseStateSchema,
  at: z.iso.datetime({ offset: true }),
  eta_min: z.number().int().min(0).optional(),
  distance_m: z.number().int().min(0).optional(),
  estimate: z.boolean().optional(),
  arrived_at: z.iso.datetime({ offset: true }).optional(),
});
export type SosResponse = z.infer<typeof sosResponseSchema>;

export const SOS_CHANNEL_TYPES = [
  'step',
  'summary',
  'responder',
  'message',
  'escalated',
  'resolved',
] as const;
export type SosChannelType = (typeof SOS_CHANNEL_TYPES)[number];

export const sosTakeoverSchema = z.object({
  sos_id: z.uuid(),
  trip_id: z.uuid(),
  sender_id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
});
export type SosTakeover = z.infer<typeof sosTakeoverSchema>;

export const SOS_TAKEOVER_TYPE = 'sos.takeover';
export const SOS_CHANNEL_NAMESPACE = 'sos';

export function sosChannel(sosId: string): string {
  return `${SOS_CHANNEL_NAMESPACE}:${sosId}`;
}

/** Channel ACL: anyone who can read the incident row (the trip's crew; RLS decides). */
export const SOS_CHANNEL_ACL_SQL =
  "SELECT EXISTS (SELECT 1 FROM help_sessions WHERE id = $1::uuid AND kind = 'sos') AS allowed";
