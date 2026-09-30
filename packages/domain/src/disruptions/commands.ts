/**
 * Disruption command payloads (docs/api-contracts-trip.md §4.12, docs/api-contracts-disruptions.md)
 * and the journey check body (`POST /v1/trips/{id}/journey-check`). The device's position is used
 * to route and is never stored.
 */
import { z } from 'zod';

import { journeyModeSchema } from './status';

const actionId = z.string().min(1).max(120);

export const decideDisruptionActionPayloadSchema = z.strictObject({
  disruption_id: z.uuid(),
  action_id: actionId,
  decision: z.enum(['approve', 'keep']),
});
export type DecideDisruptionActionPayload = z.infer<typeof decideDisruptionActionPayloadSchema>;

/** `action_id: 'all'` is "undo everything", newest first. */
export const undoDisruptionActionPayloadSchema = z.strictObject({
  disruption_id: z.uuid(),
  action_id: actionId,
});
export type UndoDisruptionActionPayload = z.infer<typeof undoDisruptionActionPayloadSchema>;

export const announceDisruptionPayloadSchema = z.strictObject({ disruption_id: z.uuid() });
export type AnnounceDisruptionPayload = z.infer<typeof announceDisruptionPayloadSchema>;

export const LATE_OPTION_KINDS = ['push', 'walk', 'skip', 'car'] as const;
export const lateOptionKindSchema = z.enum(LATE_OPTION_KINDS);
export type LateOptionKind = z.infer<typeof lateOptionKindSchema>;

export const chooseLateOptionPayloadSchema = z.strictObject({
  disruption_id: z.uuid(),
  option_id: lateOptionKindSchema,
});
export type ChooseLateOptionPayload = z.infer<typeof chooseLateOptionPayloadSchema>;

export const dismissWeatherSuggestionPayloadSchema = z.strictObject({ changeset_id: z.uuid() });
export type DismissWeatherSuggestionPayload = z.infer<typeof dismissWeatherSuggestionPayloadSchema>;

export const journeyCheckBodySchema = z.strictObject({
  item_id: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  mode: journeyModeSchema,
});
export type JourneyCheckBody = z.infer<typeof journeyCheckBodySchema>;

export const journeyCheckResultSchema = z.object({
  eta_at: z.iso.datetime({ offset: true }),
  late_min: z.number().int(),
  traffic: z.boolean(),
  estimate: z.boolean(),
  status: z.enum(['on_time', 'late', 'resolved']),
  disruption_id: z.uuid().nullable(),
});
export type JourneyCheckResult = z.infer<typeof journeyCheckResultSchema>;
