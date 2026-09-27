/**
 * Pure identity-guard rules (docs/data-model.md §3.1 Requirements table: "Sessions", "Account
 * state"; this phase's Requirements: "isAnonGcCandidate rule fn"). No DB, no network —
 * `guards.db.test.ts` covers the two functions that touch Postgres.
 */
import { DomainError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  isAnonGcCandidate,
  requireRegistered,
  requireSession,
  type GuardSession,
} from '../../src/auth/guards';

function session(overrides: Partial<GuardSession['user']> = {}): GuardSession {
  return {
    user: { id: 'uid-1', isAnonymous: false, ...overrides },
    session: { id: 'sess-1' },
  };
}

describe('requireSession', () => {
  it('returns the session unchanged when one is present', () => {
    const active = session();
    expect(requireSession(active)).toBe(active);
  });

  it('throws AUTH_REQUIRED for null', () => {
    expect(() => requireSession(null)).toThrow(DomainError);
    try {
      requireSession(null);
      throw new Error('expected requireSession to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('AUTH_REQUIRED');
    }
  });

  it('throws AUTH_REQUIRED for undefined', () => {
    expect(() => requireSession(undefined)).toThrow(DomainError);
  });
});

describe('requireRegistered', () => {
  it('returns the session when the user is not anonymous', () => {
    const active = session({ isAnonymous: false });
    expect(requireRegistered(active, 'purchase')).toBe(active);
  });

  it('throws AUTH_REQUIRED with the reason in detail when the user is anonymous', () => {
    const active = session({ isAnonymous: true });
    try {
      requireRegistered(active, 'send_invite');
      throw new Error('expected requireRegistered to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainError = error as DomainError;
      expect(domainError.code).toBe('AUTH_REQUIRED');
      expect(domainError.toResponseBody().error.detail).toMatchObject({ reason: 'send_invite' });
    }
  });

  it('throws AUTH_REQUIRED (no session) before checking isAnonymous', () => {
    expect(() => requireRegistered(null, 'second_device')).toThrow(DomainError);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('isAnonGcCandidate', () => {
  it('is true at exactly 90 days inactive with no crews and no purchases', () => {
    const now = Date.now();
    const input = {
      lastActiveAt: new Date(now - 90 * DAY_MS),
      hasCrews: false,
      hasPurchases: false,
    };
    expect(isAnonGcCandidate(input, () => now)).toBe(true);
  });

  it('is false one millisecond short of 90 days inactive', () => {
    const now = Date.now();
    const input = {
      lastActiveAt: new Date(now - 90 * DAY_MS + 1),
      hasCrews: false,
      hasPurchases: false,
    };
    expect(isAnonGcCandidate(input, () => now)).toBe(false);
  });

  it('is false when the uid has a crew, regardless of inactivity', () => {
    const now = Date.now();
    const input = {
      lastActiveAt: new Date(now - 365 * DAY_MS),
      hasCrews: true,
      hasPurchases: false,
    };
    expect(isAnonGcCandidate(input, () => now)).toBe(false);
  });

  it('is false when the uid has ever purchased, regardless of inactivity', () => {
    const now = Date.now();
    const input = {
      lastActiveAt: new Date(now - 365 * DAY_MS),
      hasCrews: false,
      hasPurchases: true,
    };
    expect(isAnonGcCandidate(input, () => now)).toBe(false);
  });
});
