/** Crew readiness for a leave-by: who is up, from which surface. */
import { z } from 'zod';

export const READINESS_STATES = ['not_up', 'up', 'ready', 'left'] as const;
export const readinessStateSchema = z.enum(READINESS_STATES);
export type ReadinessState = z.infer<typeof readinessStateSchema>;

export const READINESS_SOURCES = ['la', 'alarm', 'app', 'widget', 'notification'] as const;
export const readinessSourceSchema = z.enum(READINESS_SOURCES);
export type ReadinessSource = z.infer<typeof readinessSourceSchema>;

/** Up, ready or already gone: anything but asleep. */
export function isAwake(state: ReadinessState): boolean {
  return state !== 'not_up';
}

export const setReadinessPayloadSchema = z.object({
  leave_by_id: z.uuid(),
  state: z.enum(['up', 'not_up']),
  source: readinessSourceSchema,
});
export type SetReadinessPayload = z.infer<typeof setReadinessPayloadSchema>;

/** The `readiness` envelope on `trip_dayof:{trip_id}`. */
export interface ReadinessEnvelope {
  readonly leave_by_id: string;
  readonly up: readonly string[];
  readonly total: number;
}
