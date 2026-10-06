/**
 * The Rate the trip stack as data: where a half-rated stack resumes (the first place without a
 * verdict), what each card shows after an answer, and the verdict a swipe or button sends. Pure,
 * so the stack and its tests agree.
 */
import type { RatingCard, RatingVerdict } from '@cp/domain';

import type { RateVerdict } from '../commands';

export const TIP_LIMIT = 200;

/** The first card still waiting for a verdict, or the end (cards.length). */
export function resumeIndex(cards: readonly RatingCard[]): number {
  const index = cards.findIndex((card) => card.verdict === null);
  return index === -1 ? cards.length : index;
}

/** The command item for one answer; a blank tip is no tip, a long one is cut to the limit. */
export function verdictFor(card: RatingCard, verdict: RatingVerdict, tip: string): RateVerdict {
  const text = tip.trim().slice(0, TIP_LIMIT);
  return text === ''
    ? { poi_id: card.poi_id, verdict }
    : { poi_id: card.poi_id, verdict, tip: text };
}

/** The cards with the local answers applied, so a resumed or re-read stack shows them at once. */
export function withAnswers(
  cards: readonly RatingCard[],
  answers: ReadonlyMap<string, RateVerdict>,
): RatingCard[] {
  return cards.map((card) => {
    const answer = answers.get(card.poi_id);
    if (answer === undefined) return card;
    return {
      ...card,
      verdict: answer.verdict,
      tip: answer.tip ?? null,
      tip_status:
        answer.tip === undefined ? 'none' : card.tip === answer.tip ? card.tip_status : 'pending',
    };
  });
}

/** Tips the moderation turned down, to say so gently on their cards. */
export function rejectedTips(cards: readonly RatingCard[]): RatingCard[] {
  return cards.filter((card) => card.tip_status === 'rejected');
}
