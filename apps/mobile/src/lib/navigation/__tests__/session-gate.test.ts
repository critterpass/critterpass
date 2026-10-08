import { describe, expect, it } from '@jest/globals';

import { decideGate, sessionGateStep } from '../gates';

const ONBOARDING = '/onboarding';

describe('the session gate of a session-only group', () => {
  it('waits while the session is still being read', () => {
    const decision = decideGate({ status: 'loading' }, ONBOARDING);
    expect(sessionGateStep(decision, false)).toEqual({ kind: 'wait' });
    expect(sessionGateStep(decision, true)).toEqual({ kind: 'wait' });
  });

  it('waits for the local database of a ready session, then shows the screens', () => {
    const decision = decideGate({ status: 'ready' }, ONBOARDING);
    expect(sessionGateStep(decision, false)).toEqual({ kind: 'wait' });
    expect(sessionGateStep(decision, true)).toEqual({ kind: 'show' });
  });

  it('sends a signed-out or mid-onboarding session to onboarding, database open or not', () => {
    for (const status of ['signedOut', 'onboarding'] as const) {
      const decision = decideGate({ status }, ONBOARDING);
      expect(sessionGateStep(decision, false)).toEqual({ kind: 'redirect', href: ONBOARDING });
      expect(sessionGateStep(decision, true)).toEqual({ kind: 'redirect', href: ONBOARDING });
    }
  });

  it('sends that session where the group says instead (a sheet has no place in onboarding)', () => {
    const decision = decideGate({ status: 'onboarding' }, ONBOARDING);
    expect(sessionGateStep(decision, true, '/')).toEqual({ kind: 'redirect', href: '/' });
    // A ready session is never sent away.
    expect(sessionGateStep(decideGate({ status: 'ready' }, ONBOARDING), true, '/')).toEqual({
      kind: 'show',
    });
  });
});
