/**
 * The crew SOS Live Activity (3k-10): on recipients' phones (push-to-start at the highest
 * priority) and the sender's own (started locally), how many are coming and how long since the
 * sender was last seen. Never a position: the map stays in the app.
 */
import { z } from 'zod';

import { laLine } from './la-common';

export const LA_SOS_STATES = ['open', 'responding', 'resolved', 'cancelled'] as const;

export const sosLaAttributesSchema = z.object({
  sos_id: z.uuid(),
  sender_name: z.string().max(24),
});
export type SosLaAttributes = z.infer<typeof sosLaAttributesSchema>;

export const sosLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  state: z.enum(LA_SOS_STATES),
  responders: z.number().int().nonnegative(),
  last_seen_min: z.number().int().nonnegative().nullable(),
});
export type SosLaState = z.infer<typeof sosLaStateSchema>;

export interface SosLaInput {
  readonly sosId: string;
  readonly senderName: string;
  readonly state: (typeof LA_SOS_STATES)[number];
  readonly responders: number;
  readonly lastSeenAt: Date | null;
}

export function buildSosLaAttributes(input: SosLaInput): SosLaAttributes {
  return { sos_id: input.sosId, sender_name: laLine(input.senderName, 24) };
}

export function buildSosLaState(input: SosLaInput, now: Date, seq: number): SosLaState {
  return {
    seq,
    state: input.state,
    responders: input.responders,
    last_seen_min:
      input.lastSeenAt === null
        ? null
        : Math.max(0, Math.floor((now.getTime() - input.lastSeenAt.getTime()) / 60_000)),
  };
}
