/**
 * Group swiping, apart from any rendering: the deck as the session carries it, which card is up
 * (cards this phone already swiped and places that are in the plan are skipped), the count line,
 * who else said yes to the card on top, and the matches this phone has not stamped yet.
 */
import { swipeDeckSchema, type DeckReason, type SwipeCard } from '@cp/domain';

export type Verdict = 'yes' | 'no';

/** What this phone has swiped in a session, by place id (a "no" lives nowhere else). */
export type Swiped = Readonly<Record<string, Verdict>>;

/** The deck from the session row's JSON; anything malformed is an empty deck. */
export function parseDeck(raw: string | null | undefined): SwipeCard[] {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed = swipeDeckSchema.safeParse(JSON.parse(raw));
    return parsed.success ? [...parsed.data].sort((a, b) => a.rank - b.rank) : [];
  } catch {
    return [];
  }
}

export interface DeckState {
  /** Cards still to swipe, the one on top first. */
  readonly remaining: readonly SwipeCard[];
  /** Cards this deck asks of the viewer (in-plan places are not asked). */
  readonly total: number;
  /** How many of them are done. */
  readonly done: number;
  readonly finished: boolean;
}

export function deckState(
  deck: readonly SwipeCard[],
  swiped: Swiped,
  inPlan: ReadonlySet<string>,
): DeckState {
  const asked = deck.filter((card) => !inPlan.has(card.poi_id) || card.poi_id in swiped);
  const remaining = asked.filter((card) => !(card.poi_id in swiped));
  return {
    remaining,
    total: asked.length,
    done: asked.length - remaining.length,
    finished: deck.length > 0 && remaining.length === 0,
  };
}

/** The place this phone swiped last, for undo: the last key added. */
export function lastSwiped(swiped: Swiped): string | null {
  return Object.keys(swiped).at(-1) ?? null;
}

export function withoutSwipe(swiped: Swiped, poiId: string): Swiped {
  return Object.fromEntries(Object.entries(swiped).filter(([key]) => key !== poiId));
}

/** A swipe goes last, also when the place was swiped before (so undo takes it back first). */
export function withSwipe(swiped: Swiped, poiId: string, verdict: Verdict): Swiped {
  return { ...withoutSwipe(swiped, poiId), [poiId]: verdict };
}

/** A trip idea as the deck reads it: the place and who backs it. */
export interface DeckIdea {
  readonly id: string;
  readonly poiId: string | null;
  readonly backerIds: readonly string[];
}

/**
 * Whether a yes saves the place to the trip's Ideas under the swiper's name: every yes does, alone
 * or not, unless they already back the idea for that place (a match later adds the others).
 */
export function yesSaves(
  verdict: Verdict,
  poiId: string,
  me: string | null,
  ideas: readonly DeckIdea[],
): boolean {
  if (verdict !== 'yes') return false;
  const idea = ideas.find((entry) => entry.poiId === poiId);
  return idea === undefined || me === null || !idea.backerIds.includes(me);
}

/**
 * The idea an undone yes takes the swiper back out of: the synced one they back for the place, else
 * the one this phone just asked for (`sent`, by place id) and has not seen come back yet.
 */
export function ideaToTakeBack(
  poiId: string,
  me: string | null,
  ideas: readonly DeckIdea[],
  sent: Readonly<Record<string, string>>,
): string | null {
  const idea = ideas.find(
    (entry) => entry.poiId === poiId && me !== null && entry.backerIds.includes(me),
  );
  return idea?.id ?? sent[poiId] ?? null;
}

export interface YesVote {
  readonly poiId: string;
  readonly userId: string;
}

/** The crewmates (not the viewer) who already said yes to a place, in the crew's order. */
export function othersYes(
  votes: readonly YesVote[],
  poiId: string,
  me: string | null,
  crewOrder: readonly string[],
): string[] {
  const voters = new Set(
    votes.filter((vote) => vote.poiId === poiId && vote.userId !== me).map((vote) => vote.userId),
  );
  return [
    ...crewOrder.filter((uid) => voters.has(uid)),
    ...[...voters].filter((uid) => !crewOrder.includes(uid)),
  ];
}

export interface MatchRow {
  readonly id: string;
  readonly poiId: string;
  readonly dayNo: number | null;
}

/** The first match this phone has not shown the stamp for yet. */
export function nextMatch(
  matches: readonly MatchRow[],
  stamped: ReadonlySet<string>,
): MatchRow | null {
  return matches.find((match) => !stamped.has(match.id)) ?? null;
}

export type WhyLine =
  | { readonly kind: 'mustSee' }
  | { readonly kind: 'taste'; readonly tag: string }
  | { readonly kind: 'crewSaved'; readonly count: number }
  | { readonly kind: 'nearStay'; readonly meters: number };

/** WHY THIS? from the card's own signals, in a fixed order; unknown codes say nothing. */
export function whyLines(reasons: readonly DeckReason[]): WhyLine[] {
  const lines: WhyLine[] = [];
  for (const reason of reasons) {
    if (reason.code === 'must_see') lines.push({ kind: 'mustSee' });
    else if (reason.code === 'taste' && typeof reason.value === 'string') {
      lines.push({ kind: 'taste', tag: reason.value });
    } else if (reason.code === 'crew_saved' && typeof reason.value === 'number') {
      lines.push({ kind: 'crewSaved', count: reason.value });
    } else if (reason.code === 'near_stay' && typeof reason.value === 'number') {
      lines.push({ kind: 'nearStay', meters: reason.value });
    }
  }
  return lines;
}
