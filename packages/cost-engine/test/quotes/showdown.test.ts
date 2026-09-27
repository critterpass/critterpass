import { describe, expect, it } from 'vitest';

import { freezeQuoteSet } from '../../src/quotes/freeze';
import { createQuoteSet } from '../../src/quotes/quote-set';
import { showdown, type ShowdownInput } from '../../src/quotes/showdown';
import {
  CREW,
  FROZEN_AT,
  JORDAN,
  RIN,
  USD,
  VOTE_KYOTO,
  VOTE_LISBON,
  dollars,
} from '../golden/design-chain.fixture';

const frozen = (components: typeof VOTE_KYOTO) =>
  freezeQuoteSet(createQuoteSet(components), FROZEN_AT);

const base: ShowdownInput = {
  currency: USD,
  members: CREW,
  options: [
    { id: 'kyoto', quotes: frozen(VOTE_KYOTO) },
    { id: 'lisbon', quotes: frozen(VOTE_LISBON) },
  ],
  viewerUid: RIN,
};

describe('vote showdown golden', () => {
  it('shows Kyoto $1,480 each and Lisbon $1,920 each, with flight hours from SIN', () => {
    const result = showdown(base);
    const [kyoto, lisbon] = result.options;
    expect(kyoto).toMatchObject({ each: dollars(1_480), eachBasis: 'viewer', flightMinutes: 420 });
    expect(lisbon).toMatchObject({ each: dollars(1_920), flightMinutes: 1_020 });
    expect(kyoto?.crewEach).toEqual(dollars(1_480));
    expect(lisbon?.crewEach).toEqual(dollars(1_920));
    expect(result.winnerId).toBeNull();
  });

  it('breaks a 3–3 tie for the option $440 cheaper for the four flying from SIN', () => {
    const result = showdown({ ...base, votes: { kyoto: 3, lisbon: 3 } });
    expect(result.winnerId).toBe('kyoto');
    expect(result.tieBreak).toEqual({
      rule: 'majority_origin',
      winnerId: 'kyoto',
      runnerUpId: 'lisbon',
      origin: 'SIN',
      memberCount: 4,
      cheaperByEach: dollars(440),
    });
  });

  it('lets votes decide without the tie rule', () => {
    const result = showdown({ ...base, votes: { kyoto: 2, lisbon: 4 } });
    expect(result).toMatchObject({ winnerId: 'lisbon', tieBreak: null });
  });

  it('refuses to break a tie on quotes that are not frozen', () => {
    expect(() =>
      showdown({
        ...base,
        votes: { kyoto: 3, lisbon: 3 },
        options: [
          { id: 'kyoto', quotes: createQuoteSet(VOTE_KYOTO) },
          { id: 'lisbon', quotes: frozen(VOTE_LISBON) },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'STATE_INVALID' }) as Error);
  });

  it('shows the crew mean to a viewer whose origin is only estimated', () => {
    const members = CREW.map((m) => (m.uid === JORDAN ? { ...m, origin: null } : m));
    const result = showdown({ ...base, members, viewerUid: JORDAN });
    expect(result.options[0]).toMatchObject({ eachBasis: 'crew', viewerEach: null });
  });

  it('falls back to the crew mean when the majority group pays the same', () => {
    const cheapForOthers = VOTE_LISBON.map((c) =>
      c.origin === 'SIN'
        ? { ...c, amountMinor: 52_000n }
        : c.origin
          ? { ...c, amountMinor: 1n }
          : c,
    );
    const result = showdown({
      ...base,
      votes: { kyoto: 1, lisbon: 1 },
      options: [
        { id: 'kyoto', quotes: frozen(VOTE_KYOTO) },
        { id: 'lisbon', quotes: frozen(cheapForOthers) },
      ],
    });
    expect(result.tieBreak).toMatchObject({ rule: 'crew_mean', winnerId: 'lisbon' });
  });

  it('marks an option with a missing fare as approximate', () => {
    const missing = VOTE_KYOTO.map((c) => (c.origin === 'KUL' ? { ...c, amountMinor: null } : c));
    const result = showdown({
      ...base,
      options: [
        { id: 'kyoto', quotes: frozen(missing) },
        { id: 'lisbon', quotes: frozen(VOTE_LISBON) },
      ],
    });
    expect(result.options[0]?.approximate).toBe(true);
    expect(result.options[1]?.approximate).toBe(false);
  });
});
