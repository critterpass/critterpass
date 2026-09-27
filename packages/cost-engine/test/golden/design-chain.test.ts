import { describe, expect, it } from 'vitest';

import { computeBudgetBand } from '../../src/budget/band';
import { budgetBreakdown, feasibleLow } from '../../src/budget/breakdown';
import { freezeQuoteSet } from '../../src/quotes/freeze';
import { createQuoteSet } from '../../src/quotes/quote-set';
import { showdown } from '../../src/quotes/showdown';
import { dropout } from '../../src/resplit/dropout';
import {
  personalOptionDeltas,
  viewerQuote,
  viewerShareWithOptions,
} from '../../src/shares/personal-options';
import {
  BUDGET_TRACK,
  CREW,
  DEV,
  DRAFT,
  FROZEN_AT,
  KYOTO_INDEX,
  PRIVATE_MAXES,
  RIN,
  SHARE_BIG_ROOM,
  SKIP_NARA,
  USD,
  VOTE_KYOTO,
  VOTE_LISBON,
  dollars,
} from './design-chain.fixture';

describe('the design number chain from one fixture', () => {
  it('vote $1,480 / $1,920 + $440 → budget $1,350 → draft $1,310 → options −$140 / −$64 → dropout $1,334', () => {
    const vote = showdown({
      currency: USD,
      members: CREW,
      viewerUid: RIN,
      votes: { kyoto: 3, lisbon: 3 },
      options: [
        { id: 'kyoto', quotes: freezeQuoteSet(createQuoteSet(VOTE_KYOTO), FROZEN_AT) },
        { id: 'lisbon', quotes: freezeQuoteSet(createQuoteSet(VOTE_LISBON), FROZEN_AT) },
      ],
    });
    expect(vote.options.map((o) => o.each)).toEqual([dollars(1_480), dollars(1_920)]);
    expect(vote.tieBreak).toMatchObject({
      origin: 'SIN',
      memberCount: 4,
      cheaperByEach: dollars(440),
    });

    const trip = { flights: dollars(520), nights: 7, days: 8, index: KYOTO_INDEX };
    const band = computeBudgetBand({
      maxes: PRIVATE_MAXES,
      memberCount: 6,
      feasibleLow: feasibleLow(trip) ?? dollars(0),
      stepMinor: 5_000n,
      track: BUDGET_TRACK,
      seed: 'trip-kyoto',
    });
    expect(band).toMatchObject({ state: 'band', high: dollars(1_350), underAll: true });
    const breakdown = budgetBreakdown({ ...trip, target: dollars(1_350) });
    expect([breakdown.flights, breakdown.stays, breakdown.food, breakdown.fun]).toEqual(
      [520, 470, 220, 140].map(dollars),
    );

    expect(viewerQuote(DRAFT, RIN).displayShare).toEqual(dollars(1_310));
    expect(
      personalOptionDeltas(DRAFT, RIN, [SHARE_BIG_ROOM, SKIP_NARA]).map((d) => d.displayDelta),
    ).toEqual([dollars(-140), dollars(-64)]);
    expect(
      viewerShareWithOptions(DRAFT, RIN, [SHARE_BIG_ROOM, SKIP_NARA], ['share-big-room'])
        .displayShare,
    ).toEqual(dollars(1_170));

    const out = dropout(DRAFT, DEV).members.find((m) => m.uid === RIN);
    expect(out).toMatchObject({ after: dollars(1_334), displayDelta: dollars(24) });
  });
});
