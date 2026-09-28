import { describe, expect, it } from 'vitest';

import { referralVoidReason, REFERRAL_VELOCITY_LIMIT } from '../fraud';
import {
  canAttributeReferral,
  evaluateQualification,
  type QualificationFacts,
} from '../qualification';
import { coversUnlocked, coverUnlockedBy, referralRewardRecipients } from '../rewards';

const now = new Date('2026-10-01T12:00:00Z');

describe('referral attribution', () => {
  const facts = {
    referrerId: 'maya',
    refereeId: 'dev',
    refereeCreatedAt: new Date('2026-10-01T11:58:00Z'),
    refereeAlreadyReferred: false,
    now,
  };

  it('attributes a brand-new account to the first link it followed', () => {
    expect(canAttributeReferral(facts)).toBe(true);
  });

  it('never attributes twice, to oneself, or to an established account', () => {
    expect(canAttributeReferral({ ...facts, refereeAlreadyReferred: true })).toBe(false);
    expect(canAttributeReferral({ ...facts, refereeId: 'maya' })).toBe(false);
    expect(
      canAttributeReferral({ ...facts, refereeCreatedAt: new Date('2026-09-01T00:00:00Z') }),
    ).toBe(false);
  });
});

describe('referral qualification', () => {
  const fresh: QualificationFacts = {
    identityVerified: true,
    identitySeenBefore: false,
    deviceAttested: true,
    joinedCrew: true,
    voted: false,
    createdTrip: false,
  };

  it('waits for a vote after joining', () => {
    expect(evaluateQualification(fresh)).toEqual({ kind: 'joined' });
    expect(evaluateQualification({ ...fresh, voted: true })).toEqual({ kind: 'qualified' });
  });

  it('qualifies a referee who created a trip', () => {
    expect(evaluateQualification({ ...fresh, joinedCrew: false, createdTrip: true })).toEqual({
      kind: 'qualified',
    });
  });

  it('needs a verified identity on an attested device', () => {
    expect(evaluateQualification({ ...fresh, voted: true, identityVerified: false })).toEqual({
      kind: 'joined',
    });
    expect(evaluateQualification({ ...fresh, voted: true, deviceAttested: false })).toEqual({
      kind: 'joined',
    });
  });

  it('never qualifies an identity already seen on another account', () => {
    expect(evaluateQualification({ ...fresh, voted: true, identitySeenBefore: true })).toEqual({
      kind: 'not_new',
    });
  });

  it('is pending before the referee has done anything', () => {
    expect(evaluateQualification({ ...fresh, joinedCrew: false })).toEqual({ kind: 'pending' });
  });
});

describe('referral rewards', () => {
  it('unlocks Navy at three stamps and Collector at five, nothing beyond', () => {
    expect(coversUnlocked(2)).toEqual([]);
    expect(coversUnlocked(3)).toEqual(['navy']);
    expect(coversUnlocked(9)).toEqual(['navy', 'collector']);
    expect(coverUnlockedBy(2, 3)).toBe('navy');
    expect(coverUnlockedBy(4, 5)).toBe('collector');
    expect(coverUnlockedBy(5, 6)).toBeNull();
  });

  it('stamps both sides of a qualified referral', () => {
    expect(referralRewardRecipients({ referrerId: 'maya', refereeId: 'dev' })).toEqual([
      'maya',
      'dev',
    ]);
  });
});

describe('referral fraud', () => {
  const clean = { sharedDevice: false, identitySeenBefore: false, referrerQualifiedInWindow: 0 };

  it('voids a second account of the same person on a shared device', () => {
    expect(referralVoidReason({ ...clean, sharedDevice: true })).toBe('self_referral');
  });

  it('voids a reused identity and a referrer past the monthly velocity', () => {
    expect(referralVoidReason({ ...clean, identitySeenBefore: true })).toBe('identity_reused');
    expect(
      referralVoidReason({ ...clean, referrerQualifiedInWindow: REFERRAL_VELOCITY_LIMIT }),
    ).toBe('velocity');
    expect(
      referralVoidReason({ ...clean, referrerQualifiedInWindow: REFERRAL_VELOCITY_LIMIT - 1 }),
    ).toBeNull();
  });
});
