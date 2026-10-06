/**
 * The store's rating prompt at the end of a recap, around the shared rules (`ratingVerdict`,
 * `recapEndMoment`): what this phone knows becomes the facts, the recap end shows one moment at
 * most, the store is asked only when that moment is the review, and every decision is recorded so
 * the 120-day gap holds across phones. Nothing here draws: the store owns its sheet and may
 * decide not to show it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- moods and reasons, never copy. */
import {
  ratingVerdict,
  recapEndMoment,
  type FeedbackMood,
  type RatingFacts,
  type RecapEndMoment,
} from '@cp/domain';

/** What this app session has seen that rules a rating request out. */
const session = {
  paywall: false,
  lastErrorAt: null as Date | null,
  arbitrated: new Set<string>(),
};

export const ratingSession = {
  /** A paywall was shown: no rating request for the rest of this session. */
  notePaywall(): void {
    session.paywall = true;
  },
  /** Something failed in front of the traveller: no rating request for ten minutes. */
  noteError(at: Date = new Date()): void {
    session.lastErrorAt = at;
  },
  paywallShown: (): boolean => session.paywall,
  lastErrorAt: (): Date | null => session.lastErrorAt,
  /** True the first time a recap's end is arbitrated this session. */
  claim(recapId: string): boolean {
    if (session.arbitrated.has(recapId)) return false;
    session.arbitrated.add(recapId);
    return true;
  },
  /** Test-only: a fresh session. */
  reset(): void {
    session.paywall = false;
    session.lastErrorAt = null;
    session.arbitrated.clear();
  },
};

export interface RatingRows {
  /** An unresolved disruption on the recap's trip. */
  readonly openDisruption: boolean;
  /** One of the traveller's trips is under way. */
  readonly tripActive: boolean;
  readonly moods: readonly { readonly mood: string | null; readonly sent_at: string | null }[];
  /** When the store was last asked, from any phone. */
  readonly lastPromptAt: string | null;
}

function dateOf(value: string | null): Date | null {
  if (value === null) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function ratingFacts(
  rows: RatingRows,
  seen: {
    readonly paywall: boolean;
    readonly lastErrorAt: Date | null;
    readonly otherCard: boolean;
  },
  now: Date,
): RatingFacts {
  return {
    now,
    // The recap end exists only once the story has run to its last page.
    recapViewedToEnd: true,
    tripHasOpenDisruption: rows.openDisruption,
    tripActive: rows.tripActive,
    feedbackMoods: rows.moods.flatMap((row) => {
      const at = dateOf(row.sent_at);
      return row.mood === null || at === null ? [] : [{ mood: row.mood as FeedbackMood, at }];
    }),
    lastErrorAt: seen.lastErrorAt,
    paywallThisSession: seen.paywall,
    otherRecapCardThisSession: seen.otherCard,
    lastPromptAt: dateOf(rows.lastPromptAt),
  };
}

export interface RecapEndPorts {
  readonly rows: () => Promise<RatingRows>;
  /** Asks the store for its rating sheet; false when it cannot be asked here. */
  readonly ask: () => Promise<boolean>;
  /** Records the decision: the store was asked, or the request was held back. */
  readonly record: (asked: boolean) => Promise<unknown>;
  readonly now: () => Date;
}

export interface RecapEndCards {
  /** The free-trip ending card is due for this recap. */
  readonly ftfEnding: boolean;
  /** The rate-the-trip toast is due for this recap. */
  readonly rateTripDue: boolean;
}

/**
 * The one moment a recap's end gets this session, or `null`: another card when one is due (the
 * store is then not asked), otherwise the store's review when the rules allow it and the store
 * could be asked.
 */
export async function arbitrateRecapEnd(
  recapId: string,
  cards: RecapEndCards,
  ports: RecapEndPorts,
): Promise<RecapEndMoment | null> {
  if (!ratingSession.claim(recapId)) return null;
  const otherCard = cards.ftfEnding || cards.rateTripDue;
  const facts = ratingFacts(
    await ports.rows(),
    { paywall: ratingSession.paywallShown(), lastErrorAt: ratingSession.lastErrorAt(), otherCard },
    ports.now(),
  );
  const moment = recapEndMoment({ ...cards, rating: ratingVerdict(facts) });
  if (moment !== 'store_review') {
    await ports.record(false).catch(() => undefined);
    return moment;
  }
  const asked = await ports.ask().catch(() => false);
  await ports.record(asked).catch(() => undefined);
  return asked ? 'store_review' : null;
}
