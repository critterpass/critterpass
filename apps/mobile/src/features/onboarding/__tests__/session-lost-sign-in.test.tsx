/**
 * When a start keeps unsent changes because the session is gone, the session gate opens the
 * returning sign-in once, however many layouts ask the gate.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { sessionLost } from '@/data/app-session/session-lost';

import { useOnboardingGate } from '../flow-controller/completion';
import { RETURNING_SIGN_IN } from '../phone/session-lost-sign-in';

afterEach(() => {
  sessionLost.resetForTests();
  jest.mocked(router.push).mockClear();
});

describe('the sign-in offered when the session is gone', () => {
  it('opens the returning sign-in once, and only after a start found the session gone', async () => {
    await renderHook(() => useOnboardingGate());
    await renderHook(() => useOnboardingGate());
    expect(router.push).not.toHaveBeenCalled();

    await act(() => sessionLost.set());

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(RETURNING_SIGN_IN);
    expect(RETURNING_SIGN_IN).toBe('/onboarding/phone?mode=returning');
  });
});
