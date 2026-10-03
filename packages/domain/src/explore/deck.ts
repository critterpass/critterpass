/**
 * The swipe deck (docs/product-decisions.md §7 group swiping): 30 cards ranked in code from the
 * crew's taste, the plan's gaps (places already in the plan never appear) and distance from the
 * stay; the guide adds one note per card afterwards, by id. WHY THIS? is built from the same
 * signals as reason codes the app words, so it never depends on the model.
 */
import { z } from 'zod';

import { distinctPlaces, type PlaceIdentity } from './place-dupes';

export const DECK_SIZE = 30;
export const DECK_NOTE_MAX = 140;

export const DECK_REASON_CODES = ['must_see', 'taste', 'crew_saved', 'near_stay'] as const;
export const deckReasonSchema = z.object({
  code: z.enum(DECK_REASON_CODES),
  /** The matched taste tag, the save count or the distance in metres. */
  value: z.union([z.string(), z.number()]).optional(),
});
export type DeckReason = z.infer<typeof deckReasonSchema>;

export const swipeCardSchema = z.object({
  poi_id: z.uuid(),
  rank: z.number().int().positive(),
  score: z.number(),
  reasons: z.array(deckReasonSchema),
  note: z.string().max(DECK_NOTE_MAX).nullable(),
});
export type SwipeCard = z.infer<typeof swipeCardSchema>;
export const swipeDeckSchema = z.array(swipeCardSchema).max(DECK_SIZE);

export interface DeckCandidate {
  readonly poi_id: string;
  readonly tags: readonly string[];
  readonly must_see: boolean;
  /** Straight-line metres from the stay; null without one. */
  readonly distance_m: number | null;
  readonly crew_saves: number;
  readonly in_plan: boolean;
  /** Name, category and position: rows that are the same place reach the deck once. */
  readonly place?: PlaceIdentity;
}

/** How many of the crew hold each taste tag. */
export type CrewTaste = Readonly<Record<string, number>>;

const NEAR_STAY_M = 2_000;

function score(candidate: DeckCandidate, taste: CrewTaste, crewSize: number) {
  const reasons: DeckReason[] = [];
  let total = 0;
  if (candidate.must_see) {
    total += 3;
    reasons.push({ code: 'must_see' });
  }
  const liked = candidate.tags
    .map((tag) => ({ tag, count: taste[tag] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const tasteScore = liked.reduce((sum, entry) => sum + entry.count / Math.max(1, crewSize), 0);
  total += Math.min(3, tasteScore * 2);
  const best = liked[0];
  if (best !== undefined) reasons.push({ code: 'taste', value: best.tag });
  if (candidate.crew_saves > 0) {
    total += Math.min(3, candidate.crew_saves * 1.5);
    reasons.push({ code: 'crew_saved', value: candidate.crew_saves });
  }
  if (candidate.distance_m !== null) {
    total += 2 * Math.exp(-candidate.distance_m / 3_000);
    if (candidate.distance_m <= NEAR_STAY_M) {
      reasons.push({ code: 'near_stay', value: Math.round(candidate.distance_m) });
    }
  }
  return { total: Math.round(total * 1000) / 1000, reasons };
}

/**
 * Ranks candidates into the deck: best first, ties by id for stability, one card per place (a
 * place's best row; none when the plan has it under any of its rows), in-plan places out.
 */
export function rankDeck(
  candidates: readonly DeckCandidate[],
  taste: CrewTaste,
  crewSize: number,
  size = DECK_SIZE,
  destination = '',
): SwipeCard[] {
  const ranked = candidates
    .map((candidate) => ({ candidate, ...score(candidate, taste, crewSize) }))
    .sort(
      (a, b) =>
        Number(b.candidate.in_plan) - Number(a.candidate.in_plan) ||
        b.total - a.total ||
        a.candidate.poi_id.localeCompare(b.candidate.poi_id),
    );
  const placed = ranked.flatMap(({ candidate, ...rest }) =>
    candidate.place === undefined ? [] : [{ ...candidate.place, entry: { candidate, ...rest } }],
  );
  const kept = new Set(distinctPlaces(placed, destination).map((row) => row.entry.candidate));
  return ranked
    .filter((entry) => entry.candidate.place === undefined || kept.has(entry.candidate))
    .filter((entry) => !entry.candidate.in_plan)
    .slice(0, size)
    .map((entry, index) => ({
      poi_id: entry.candidate.poi_id,
      rank: index + 1,
      score: entry.total,
      reasons: entry.reasons,
      note: null,
    }));
}

/** Yes votes a card needs: min(2, participants), so a solo traveller matches alone. */
export function matchRuleFor(participants: number): 1 | 2 {
  return participants >= 2 ? 2 : 1;
}
