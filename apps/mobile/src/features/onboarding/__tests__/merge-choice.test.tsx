// Skia's native renderer does not exist under Jest; see ui/test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Link: ({ children }: { children: unknown }) => children,
  Redirect: () => null,
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { isOnboardingComplete, setOnboardingComplete } from '@/lib/links/pending';

import { clearDraftForTests, updateDraft } from '../flow-controller/draft-store';
import { PhoneScreen } from '../phone/PhoneScreen';
import { SaveScreen } from '../save/SaveScreen';
import { fakeServices, renderOnboarding } from '../test-support/harness';
import type { OnboardingServices } from '../services';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

/** A Google account already saved to an older pass: link-social answers with a merge ticket. */
function googleWithOldPass(confirmMerge = jest.fn(() => Promise.resolve(merged))) {
  const base = fakeServices();
  const services: OnboardingServices = {
    ...base,
    auth: {
      ...base.auth,
      linkGoogle: () => Promise.resolve({ kind: 'merge_required', ticket: 't-1' }),
      startMerge: () =>
        Promise.resolve({
          kind: 'preview',
          crews: [
            { id: 'c1', name: 'The Bali Six', owner: 'existing' },
            { id: 'c2', name: 'Hehe', owner: 'anon' },
          ],
          trips: [],
        }),
      confirmMerge,
    },
  };
  return { services, confirmMerge };
}
const merged = { kind: 'merged' as const, userId: 'u-old' };

beforeEach(() => {
  clearDraftForTests();
  setOnboardingComplete(false);
  updateDraft((d) => ({
    ...d,
    given_name: 'Winston',
    avatar: { kind: 'critter', form_id: 'guide:tokek' },
    taste_done: true,
    home_iata: 'SIN',
    issued_at: new Date().toISOString(),
    step: 'issued',
  }));
  jest.mocked(router.replace).mockClear();
});

describe('save sheet: a sign-in that already has a pass', () => {
  it('leads with switching to the old pass, and switching signs in to it', async () => {
    const { services, confirmMerge } = googleWithOldPass();
    await renderOnboarding(<SaveScreen />, { services });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.getByText('YOU ALREADY HAVE A PASS')).toBeTruthy();
    expect(
      screen.getByText(/Your Google account is saved to a pass you made before/u),
    ).toBeTruthy();
    expect(screen.getByText('The Bali Six')).toBeTruthy();
    expect(screen.getByText('1 crew from this phone comes with you.')).toBeTruthy();
    await activate(screen.getByTestId('merge-use-existing'));
    await flush();
    expect(confirmMerge).toHaveBeenCalledWith('t-1');
    expect(isOnboardingComplete()).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('says what keeping the new pass means, then still offers the switch', async () => {
    const { services, confirmMerge } = googleWithOldPass();
    await renderOnboarding(<SaveScreen />, { services });
    await activate(screen.getByTestId('save-google'));
    await flush();
    await activate(screen.getByTestId('merge-keep-new'));
    expect(screen.getByTestId('merge-kept')).toHaveTextContent(
      /Your Google account stays with your old pass, and this phone keeps the new one/u,
    );
    await activate(screen.getByTestId('merge-kept-done'));
    expect(screen.getByTestId('save-google')).toBeTruthy();
    expect(screen.getByTestId('merge-declined')).toHaveTextContent(
      /Your Google account stays with your old pass/u,
    );
    await activate(screen.getByTestId('merge-declined-switch'));
    await activate(screen.getByTestId('merge-use-existing'));
    await flush();
    expect(confirmMerge).toHaveBeenCalledWith('t-1');
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('phone page: a sign-in that already has a pass', () => {
  it('asks in its own sheet, not under "Your number"', async () => {
    const { services, confirmMerge } = googleWithOldPass();
    await renderOnboarding(<PhoneScreen />, { services });
    await activate(screen.getByTestId('phone-google'));
    await flush();
    expect(screen.getByTestId('merge-sheet')).toHaveTextContent(/YOU ALREADY HAVE A PASS/u);
    await activate(screen.getByTestId('merge-use-existing'));
    await flush();
    expect(confirmMerge).toHaveBeenCalledWith('t-1');
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('switches straight from the "kept" explanation', async () => {
    const { services, confirmMerge } = googleWithOldPass();
    await renderOnboarding(<PhoneScreen />, { services });
    await activate(screen.getByTestId('phone-google'));
    await flush();
    await activate(screen.getByTestId('merge-keep-new'));
    await activate(screen.getByTestId('merge-kept-switch'));
    await flush();
    expect(confirmMerge).toHaveBeenCalledWith('t-1');
  });

  it('closes the explanation back to the number form with the switch still on offer', async () => {
    const { services } = googleWithOldPass();
    await renderOnboarding(<PhoneScreen />, { services });
    await activate(screen.getByTestId('phone-google'));
    await flush();
    await activate(screen.getByTestId('merge-keep-new'));
    await activate(screen.getByTestId('merge-kept-done'));
    expect(screen.queryByTestId('merge-sheet')).toBeNull();
    expect(screen.getByTestId('phone-send')).toBeTruthy();
    expect(screen.getByTestId('merge-declined-switch')).toBeTruthy();
  });

  it('asks to sign in again when the merge ticket expired', async () => {
    const { services } = googleWithOldPass(
      jest.fn(() => Promise.resolve({ kind: 'ticket_invalid' as const })) as never,
    );
    await renderOnboarding(<PhoneScreen />, { services });
    await activate(screen.getByTestId('phone-google'));
    await flush();
    await activate(screen.getByTestId('merge-use-existing'));
    await flush();
    expect(screen.getByTestId('phone-save-error')).toHaveTextContent(/Sign in again/u);
  });
});
