import { describe, expect, it } from 'vitest';

import { guideMeterSubject, quotaDecision, redraftReservationDecision } from '../src/quotas';

describe('guideMeterSubject', () => {
  it('is unmetered system work regardless of who triggered it', () => {
    expect(
      guideMeterSubject({ isSystemWork: true, askerGuideUnlimited: false, isCrewChat: false }),
    ).toEqual({ metered: false, reason: 'system' });
  });

  it('is unmetered for a Pass+/Boost asker', () => {
    expect(
      guideMeterSubject({ isSystemWork: false, askerGuideUnlimited: true, isCrewChat: false }),
    ).toEqual({ metered: false, reason: 'unlimited' });
  });

  it('meters a plain 1:1 ask from a free-tier asker', () => {
    expect(
      guideMeterSubject({ isSystemWork: false, askerGuideUnlimited: false, isCrewChat: false }),
    ).toEqual({ metered: true });
  });

  it("meters the asker's own crew-chat ask when no member holds Pass+", () => {
    expect(
      guideMeterSubject({
        isSystemWork: false,
        askerGuideUnlimited: false,
        isCrewChat: true,
        crewPassHolders: [],
      }),
    ).toEqual({ metered: true });
  });

  it('is unmetered in crew chat when another member holds Pass+, even if the asker is free-tier', () => {
    expect(
      guideMeterSubject({
        isSystemWork: false,
        askerGuideUnlimited: false,
        isCrewChat: true,
        crewPassHolders: ['maya'],
      }),
    ).toEqual({ metered: false, reason: 'crew_pass_holder' });
  });

  it('a crew-chat Pass+ holder is exempt via "unlimited", not "crew_pass_holder"', () => {
    expect(
      guideMeterSubject({
        isSystemWork: false,
        askerGuideUnlimited: true,
        isCrewChat: true,
        crewPassHolders: [],
      }),
    ).toEqual({ metered: false, reason: 'unlimited' });
  });
});

describe('quotaDecision', () => {
  const RESET_AT = '2026-06-16T00:00:00+08:00';

  it('allows the 30th question (used=29 going in)', () => {
    expect(quotaDecision({ used: 29, limit: 30, resetAt: RESET_AT })).toEqual({
      ok: true,
      used: 29,
      limit: 30,
      resetAt: RESET_AT,
    });
  });

  it('rejects the 31st question (used=30 going in) with QUOTA_EXHAUSTED detail', () => {
    expect(quotaDecision({ used: 30, limit: 30, resetAt: RESET_AT })).toEqual({
      ok: false,
      detail: { used: 30, limit: 30, resetAt: RESET_AT },
    });
  });

  it('includes crewPassHolders in the exhausted detail only when non-empty', () => {
    expect(quotaDecision({ used: 30, limit: 30, resetAt: RESET_AT }, [])).toEqual({
      ok: false,
      detail: { used: 30, limit: 30, resetAt: RESET_AT },
    });

    expect(quotaDecision({ used: 30, limit: 30, resetAt: RESET_AT }, ['maya'])).toEqual({
      ok: false,
      detail: { used: 30, limit: 30, resetAt: RESET_AT, crewPassHolders: ['maya'] },
    });
  });
});

describe('redraftReservationDecision', () => {
  it('allows a reservation under the free-tier cap of 3', () => {
    expect(redraftReservationDecision(0, 3)).toEqual({ ok: true });
    expect(redraftReservationDecision(2, 3)).toEqual({ ok: true });
  });

  it('rejects the 4th reservation with REDRAFT_LIMIT detail', () => {
    expect(redraftReservationDecision(3, 3)).toEqual({
      ok: false,
      detail: { used: 3, limit: 3 },
    });
  });

  it('never blocks an unlimited (Boost/FTF/crew-year) trip', () => {
    expect(redraftReservationDecision(999, Infinity)).toEqual({ ok: true });
  });
});
