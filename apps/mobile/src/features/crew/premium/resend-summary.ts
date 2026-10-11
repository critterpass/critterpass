/** How one resend to every unanswered invitee reads back on the invite sheet. */
/* eslint-disable lingui/no-unlocalized-strings -- outcome kinds, never copy. */
import type { SendNudgePayload } from '@cp/domain';

import type { NudgeOutcome } from '@/features/home/nudge/use-nudge';

/** A delivery within this of now counts as sent now. */
const SOON_MS = 2 * 60_000;

export type ResendWhen = NonNullable<SendNudgePayload['when']>;

/** What the sheet says once every unanswered invite was sent again. */
export type ResendSummary =
  | { readonly kind: 'sent' }
  | { readonly kind: 'scheduled'; readonly at: string }
  | { readonly kind: 'too_soon'; readonly nextAt: Date }
  | { readonly kind: 'relayed' }
  | { readonly kind: 'failed' };

/**
 * Folds the per-invitee answers into one: a relay already opened the share sheet; a later delivery
 * names its time (the earliest); `sent` only when everything went now; a refusal for every invitee
 * is the cooldown (when that was the reason) or a failure.
 */
export function summariseResend(outcomes: readonly NudgeOutcome[], now: Date): ResendSummary {
  const delivered = outcomes.filter((o) => o.kind === 'scheduled' || o.kind === 'inbox');
  if (delivered.length > 0) {
    const later = delivered
      .flatMap((o) =>
        o.kind === 'scheduled' && Date.parse(o.sendAt) > now.getTime() + SOON_MS ? [o] : [],
      )
      .sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt));
    const first = later[0];
    return first === undefined ? { kind: 'sent' } : { kind: 'scheduled', at: first.at };
  }
  if (outcomes.some((o) => o.kind === 'relay')) return { kind: 'relayed' };
  const waits = outcomes.flatMap((o) => (o.kind === 'too_soon' ? [o.nextAt] : []));
  if (waits.length > 0 && waits.length === outcomes.length) {
    return { kind: 'too_soon', nextAt: new Date(Math.min(...waits.map((d) => d.getTime()))) };
  }
  return { kind: 'failed' };
}
