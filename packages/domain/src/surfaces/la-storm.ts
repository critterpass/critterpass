/**
 * The storm Live Activity (3k-8): a weather watch over the trip, with its severity, the window it
 * covers and the one thing to do about it; tapping opens the replan flow.
 */
import { z } from 'zod';

import { laLine, unixSeconds, unixSecondsSchema } from './la-common';

export const LA_STORM_SEVERITIES = ['advisory', 'watch', 'warning'] as const;

export const stormLaAttributesSchema = z.object({
  trip_id: z.uuid(),
  watch_id: z.uuid(),
});
export type StormLaAttributes = z.infer<typeof stormLaAttributesSchema>;

export const stormLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  state: z.enum(['active', 'passed']),
  severity: z.enum(LA_STORM_SEVERITIES),
  window_start: unixSecondsSchema,
  window_end: unixSecondsSchema,
  headline: z.string().max(60),
  action_line: z.string().max(100),
});
export type StormLaState = z.infer<typeof stormLaStateSchema>;

export interface StormLaInput {
  readonly tripId: string;
  readonly watchId: string;
  readonly severity: (typeof LA_STORM_SEVERITIES)[number];
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly headline: string;
  readonly actionLine: string;
}

export function buildStormLaAttributes(input: StormLaInput): StormLaAttributes {
  return { trip_id: input.tripId, watch_id: input.watchId };
}

export function buildStormLaState(input: StormLaInput, now: Date, seq: number): StormLaState {
  return {
    seq,
    state: now.getTime() >= input.windowEnd.getTime() ? 'passed' : 'active',
    severity: input.severity,
    window_start: unixSeconds(input.windowStart),
    window_end: unixSeconds(input.windowEnd),
    headline: laLine(input.headline, 60),
    action_line: laLine(input.actionLine, 100),
  };
}
