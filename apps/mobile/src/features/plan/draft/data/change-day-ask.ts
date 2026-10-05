/**
 * What she has chosen and written on the change-a-day sheet, kept while the app runs: closing the
 * sheet (its ✕, a swipe down, the last-redraft question) never throws her words away, and opening
 * it again brings them back. Forgotten once the redraft is sent.
 */
import type { RedraftReasonKey } from '@cp/domain';

export interface ChangeDayAsk {
  readonly day: number;
  readonly reasons: readonly RedraftReasonKey[];
  readonly note: string;
}

const asks = new Map<string, ChangeDayAsk>();

export function rememberedChangeDayAsk(tripId: string): ChangeDayAsk | undefined {
  return asks.get(tripId);
}

export function rememberChangeDayAsk(tripId: string, ask: ChangeDayAsk): void {
  if (ask.reasons.length === 0 && ask.note.trim() === '') asks.delete(tripId);
  else asks.set(tripId, ask);
}

export function forgetChangeDayAsk(tripId: string): void {
  asks.delete(tripId);
}
