import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  RATING_PROMPT_GAP_DAYS,
  ratingVerdict,
  recapEndMoment,
  type RatingFacts,
} from './rating-arbiter';
import { FEEDBACK_MOODS } from './schemas';

const DAY = 86_400_000;
const NOW = new Date('2026-10-06T10:00:00Z');

const good: RatingFacts = {
  now: NOW,
  recapViewedToEnd: true,
  tripHasOpenDisruption: false,
  tripActive: false,
  feedbackMoods: [],
  lastErrorAt: null,
  paywallThisSession: false,
  otherRecapCardThisSession: false,
  lastPromptAt: null,
};

const ago = (ms: number) => new Date(NOW.getTime() - ms);

const factsArb: fc.Arbitrary<RatingFacts> = fc.record({
  now: fc.constant(NOW),
  recapViewedToEnd: fc.boolean(),
  tripHasOpenDisruption: fc.boolean(),
  tripActive: fc.boolean(),
  feedbackMoods: fc.array(
    fc.record({
      mood: fc.constantFrom(...FEEDBACK_MOODS),
      at: fc.integer({ min: 0, max: 90 * DAY }).map(ago),
    }),
    { maxLength: 4 },
  ),
  lastErrorAt: fc.option(fc.integer({ min: 0, max: 60 * 60_000 }).map(ago)),
  paywallThisSession: fc.boolean(),
  otherRecapCardThisSession: fc.boolean(),
  lastPromptAt: fc.option(fc.integer({ min: 0, max: 400 * DAY }).map(ago)),
});

describe('rating arbiter', { timeout: 60_000 }, () => {
  it('asks after a trip that ended well', () => {
    expect(ratingVerdict(good)).toEqual({ ask: true });
  });

  it('never asks in a session that showed a paywall, during a trip or within 120 days', () => {
    fc.assert(
      fc.property(factsArb, (facts) => {
        const verdict = ratingVerdict(facts);
        if (facts.paywallThisSession || facts.tripActive) expect(verdict.ask).toBe(false);
        if (
          facts.lastPromptAt !== null &&
          NOW.getTime() - facts.lastPromptAt.getTime() < RATING_PROMPT_GAP_DAYS * DAY
        ) {
          expect(verdict.ask).toBe(false);
        }
        if (!facts.recapViewedToEnd || facts.otherRecapCardThisSession) {
          expect(verdict.ask).toBe(false);
        }
      }),
    );
  });

  it('asks only when every rule holds', () => {
    fc.assert(
      fc.property(factsArb, (facts) => {
        if (!ratingVerdict(facts).ask) return;
        expect(facts.recapViewedToEnd && !facts.tripHasOpenDisruption).toBe(true);
        expect(facts.tripActive || facts.paywallThisSession).toBe(false);
        expect(facts.otherRecapCardThisSession).toBe(false);
      }),
    );
  });

  it('a GRR or MEH note in the last 30 days holds the ask; an older one does not', () => {
    expect(ratingVerdict({ ...good, feedbackMoods: [{ mood: 'meh', at: ago(29 * DAY) }] })).toEqual(
      { ask: false, reason: 'unhappy_feedback' },
    );
    expect(
      ratingVerdict({ ...good, feedbackMoods: [{ mood: 'grr', at: ago(31 * DAY) }] }).ask,
    ).toBe(true);
    expect(ratingVerdict({ ...good, feedbackMoods: [{ mood: 'love', at: ago(DAY) }] }).ask).toBe(
      true,
    );
  });

  it('waits ten minutes after an error and 120 days after the last ask', () => {
    expect(ratingVerdict({ ...good, lastErrorAt: ago(9 * 60_000) }).ask).toBe(false);
    expect(ratingVerdict({ ...good, lastErrorAt: ago(11 * 60_000) }).ask).toBe(true);
    expect(ratingVerdict({ ...good, lastPromptAt: ago(119 * DAY) }).ask).toBe(false);
    expect(ratingVerdict({ ...good, lastPromptAt: ago(121 * DAY) }).ask).toBe(true);
  });
});

describe('recap end moment', { timeout: 60_000 }, () => {
  it('shows one moment at most, by priority', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), factsArb, (ftfEnding, rateTripDue, facts) => {
        const rating = ratingVerdict(facts);
        const moment = recapEndMoment({ ftfEnding, rateTripDue, rating });
        if (ftfEnding) expect(moment).toBe('ftf_ending');
        else if (rateTripDue) expect(moment).toBe('rate_trip');
        else expect(moment).toBe(rating.ask ? 'store_review' : null);
      }),
    );
  });

  it('a free-trip ending leaves no store review for the session', () => {
    const moment = recapEndMoment({ ftfEnding: true, rateTripDue: false, rating: { ask: true } });
    expect(moment).toBe('ftf_ending');
    // The card surfaced, so the same session's next look at the arbiter must hold the ask.
    expect(ratingVerdict({ ...good, otherRecapCardThisSession: true }).ask).toBe(false);
  });
});
