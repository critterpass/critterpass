import { describe, expect, it } from 'vitest';

import {
  assertApprovedByKindAllowed,
  canTransitionChangeSet,
  transitionChangeSet,
} from '../../src/state/change-set';
import { CHANGE_SET_STATUSES, type ChangeSetStatus } from '../../src/enums/plan';

describe('change set state machine', () => {
  it('accepts the documented happy path', () => {
    expect(canTransitionChangeSet(null, 'draft')).toBe(true);
    expect(canTransitionChangeSet('draft', 'proposed')).toBe(true);
    expect(canTransitionChangeSet('proposed', 'voting')).toBe(true);
    expect(canTransitionChangeSet('voting', 'approved')).toBe(true);
    expect(canTransitionChangeSet('approved', 'applied')).toBe(true);
    expect(canTransitionChangeSet('applied', 'reverted')).toBe(true);
  });

  it('lets an organiser/self decision skip formal voting', () => {
    expect(canTransitionChangeSet('proposed', 'approved')).toBe(true);
    expect(canTransitionChangeSet('proposed', 'rejected')).toBe(true);
  });

  it('rejects a decision from a poll that never opened', () => {
    expect(canTransitionChangeSet('draft', 'approved')).toBe(false);
  });

  it('rejects re-deciding an already-applied change set', () => {
    expect(canTransitionChangeSet('applied', 'approved')).toBe(false);
  });

  it('allows stale from every non-terminal status and from none of the terminal ones', () => {
    const nonTerminal: readonly ChangeSetStatus[] = ['draft', 'proposed', 'voting', 'approved'];
    const terminal: readonly ChangeSetStatus[] = ['applied', 'rejected', 'reverted', 'stale'];
    for (const status of nonTerminal) {
      expect(canTransitionChangeSet(status, 'stale')).toBe(true);
    }
    for (const status of terminal) {
      expect(canTransitionChangeSet(status, 'stale')).toBe(false);
    }
  });

  it('makes every declared status reachable from some other status or from creation', () => {
    const candidates: readonly (ChangeSetStatus | null)[] = [null, ...CHANGE_SET_STATUSES];
    for (const status of CHANGE_SET_STATUSES) {
      expect(candidates.some((from) => canTransitionChangeSet(from, status))).toBe(true);
    }
  });

  it('throws STATE_INVALID for an illegal transition', () => {
    expect(() => transitionChangeSet('draft', 'applied')).toThrow('STATE_INVALID');
  });
});

describe('assertApprovedByKindAllowed', () => {
  it('allows a non-policy kind from either actor', () => {
    expect(() => assertApprovedByKindAllowed('organiser', false)).not.toThrow();
    expect(() => assertApprovedByKindAllowed(null, false)).not.toThrow();
  });

  it('allows policy only from the system actor', () => {
    expect(() => assertApprovedByKindAllowed('policy', true)).not.toThrow();
    expect(() => assertApprovedByKindAllowed('policy', false)).toThrow('FORBIDDEN');
  });
});
