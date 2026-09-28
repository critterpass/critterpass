/**
 * Nudge rules (docs/product-decisions.md, docs/api-contracts.md §4.3 `send_nudge`): one nudge
 * per (sender, target) per 24 hours, at most two received per target per local day, never inside
 * the target's quiet hours. `NUDGE_TOO_SOON` carries `next_at`, the first instant the pair may
 * nudge again.
 */
import { z } from 'zod';

import { nudgeReasonSchema } from '../home/events';

export const NUDGE_PAIR_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const NUDGE_TARGET_DAILY_CAP = 2;
export const NUDGE_DISPATCH_QUEUE = 'nudge.dispatch';

export const sendNudgePayloadSchema = z.object({
  target_uid: z.uuid(),
  reason: nudgeReasonSchema,
  /** What the nudge is about (a poll, a trip, a leave-by, an expense); defaults to the crew. */
  context: z.object({ kind: z.string().regex(/^[a-z_]{1,40}$/), id: z.uuid() }).optional(),
});
export type SendNudgePayload = z.infer<typeof sendNudgePayloadSchema>;

export interface NudgeGuide {
  readonly slug: string;
  readonly name: string;
}

export type SendNudgeResult =
  /** Pushed at the target's engagement hour (and filed in their inbox then). */
  | {
      readonly outcome: 'scheduled';
      readonly nudge_id: string;
      readonly send_at: string;
      /** `HH:MM` in the target's zone, for the toast. */
      readonly send_at_local: string;
      readonly tz: string;
      readonly guide: NudgeGuide;
      readonly target_name: string;
    }
  /** The target has the app but no push permission: an inbox item only, filed now. */
  | {
      readonly outcome: 'inbox';
      readonly nudge_id: string;
      readonly guide: NudgeGuide;
      readonly target_name: string;
    }
  /** The target never installed the app: the sender shares it themselves (nothing sent by us). */
  | {
      readonly outcome: 'relay';
      readonly relay: 'share_sheet';
      readonly nudge_id: string;
      readonly text: string;
      readonly url: string | null;
      readonly guide: NudgeGuide;
      readonly target_name: string;
    };

/** When the pair may nudge again, or null when they may now. */
export function nudgeAvailableAt(lastSentByPairAt: Date | null, now: Date): Date | null {
  if (lastSentByPairAt === null) return null;
  const next = new Date(lastSentByPairAt.getTime() + NUDGE_PAIR_COOLDOWN_MS);
  return next.getTime() > now.getTime() ? next : null;
}

export const recordAppOpenPayloadSchema = z.object({
  hour_local: z.number().int().min(0).max(23),
});
export type RecordAppOpenPayload = z.infer<typeof recordAppOpenPayloadSchema>;
