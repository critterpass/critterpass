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

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { SendOtpOutcome, VerifyOtpOutcome } from '@/data/auth';
import { isOnboardingComplete, setOnboardingComplete } from '@/lib/links/pending';

import { clearDraftForTests, readDraft, updateDraft } from '../flow-controller/draft-store';
import { IssuedScreen } from '../issued/IssuedScreen';
import { PhoneScreen } from '../phone/PhoneScreen';
import { formatE164, resendWaitS, toE164 } from '../phone/phone-number';
import { SaveScreen } from '../save/SaveScreen';
import { fakeServices, recordingAnalytics, renderOnboarding } from '../test-support/harness';
import type { OnboardingServices } from '../services';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

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
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});
afterEach(() => {
  jest.useRealTimers();
});

describe('3a-6 pass issued', () => {
  it('prints the finished pass with SYNCING until the number arrives', async () => {
    const analytics = recordingAnalytics();
    await renderOnboarding(<IssuedScreen />, { analytics });
    expect(screen.getByTestId('onboarding-pass-number')).toHaveTextContent('CP-····');
    expect(screen.getByText('SYNCING', { includeHiddenElements: true })).toBeTruthy();
    expect(analytics.events.map((e) => e.event)).toContain('pass_issued');
    await activate(screen.getByTestId('onboarding-issued-save'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/save');
  });

  it('shows the reserved number once it is on the pass', async () => {
    updateDraft((d) => ({ ...d, number: 'CP-0427' }));
    await renderOnboarding(<IssuedScreen />);
    expect(screen.getByTestId('onboarding-pass-number')).toHaveTextContent('CP-0427');
    expect(screen.queryByText('SYNCING', { includeHiddenElements: true })).toBeNull();
  });
});

function withAuth(auth: Partial<OnboardingServices['auth']>): OnboardingServices {
  const base = fakeServices();
  return { ...base, auth: { ...base.auth, ...auth } };
}

describe('3a-7 save your pass', () => {
  it('links Google, ticks SAVED and moves on to permissions', async () => {
    jest.useFakeTimers();
    await renderOnboarding(<SaveScreen />);
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.getByTestId('pass-saved-tick')).toBeTruthy();
    expect(readDraft()?.saved).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(router.replace).toHaveBeenCalledWith('/onboarding/permissions');
  });

  it.each([
    [{ kind: 'error', code: 'NETWORK' } as const, /No signal right now/u],
    [{ kind: 'different_emails_not_allowed' } as const, /different email/u],
  ])('explains a failed link (%o)', async (outcome, line) => {
    await renderOnboarding(<SaveScreen />, {
      services: withAuth({ linkGoogle: () => Promise.resolve(outcome) }),
    });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.getByTestId('save-error')).toHaveTextContent(line);
  });

  it('stays put when the provider sheet is cancelled', async () => {
    await renderOnboarding(<SaveScreen />, {
      services: withAuth({ linkGoogle: () => Promise.resolve({ kind: 'cancelled' }) }),
    });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.queryByTestId('save-error')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers merge-or-switch when the account already has a pass', async () => {
    const confirmMerge = jest.fn(() =>
      Promise.resolve({ kind: 'merged' as const, userId: 'u-old' }),
    );
    const services = withAuth({
      linkGoogle: () => Promise.resolve({ kind: 'merge_required', ticket: 't-1' }),
      startMerge: () =>
        Promise.resolve({
          kind: 'preview',
          crews: [{ id: 'c1', name: 'The Bali Six', owner: 'existing' }],
          trips: [],
        }),
      confirmMerge,
    });
    await renderOnboarding(<SaveScreen />, { services });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.getByText('The Bali Six')).toBeTruthy();
    await activate(screen.getByTestId('merge-use-existing'));
    await flush();
    expect(confirmMerge).toHaveBeenCalledWith('t-1');
    expect(isOnboardingComplete()).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('keeps this pass when the user backs out of the merge', async () => {
    const services = withAuth({
      linkGoogle: () => Promise.resolve({ kind: 'merge_required', ticket: 't-1' }),
    });
    await renderOnboarding(<SaveScreen />, { services });
    await activate(screen.getByTestId('save-google'));
    await flush();
    await activate(screen.getByTestId('merge-keep-new'));
    expect(screen.getByTestId('save-google')).toBeTruthy();
  });

  it('lets the user skip saving for now', async () => {
    await renderOnboarding(<SaveScreen />);
    await activate(screen.getByTestId('save-not-now'));
    expect(readDraft()?.step).toBe('saved');
    expect(router.replace).toHaveBeenCalledWith('/onboarding/permissions');
  });
});

describe('3a-8 phone sign-in', () => {
  it('builds E.164 numbers and grows the resend wait', () => {
    expect(toE164('SG', '9123 4567')).toBe('+6591234567');
    expect(toE164('VN', '0912 345 678')).toBe('+84912345678');
    expect(toE164('SG', '12')).toBeNull();
    expect(formatE164('SG', '91234567')).toBe('+65 9123 4567');
    expect([1, 2, 3, 4].map(resendWaitS)).toEqual([30, 60, 120, 120]);
  });

  async function sendCode(services: OnboardingServices, number = '91234567') {
    await renderOnboarding(<PhoneScreen />, { services });
    await fireEvent.changeText(screen.getByTestId('phone-number'), number);
    await activate(screen.getByTestId('phone-send'));
    await flush();
  }

  it('sends the code on WhatsApp, verifies it and moves on after the clap', async () => {
    jest.useFakeTimers();
    await sendCode(fakeServices());
    expect(screen.getByTestId('phone-sent')).toHaveTextContent(
      'Code sent to +65 9123 4567 on WhatsApp',
    );
    expect(screen.getByTestId('phone-resend')).toHaveTextContent(/30/u);
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '419203');
    await flush();
    expect(readDraft()?.saved).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(2200);
      await Promise.resolve();
    });
    expect(router.replace).toHaveBeenCalledWith('/onboarding/permissions');
  });

  it.each([
    [{ kind: 'country_unsupported' } as const, /can’t send codes to that country/u],
    [{ kind: 'rate_limited', retryAfterS: 600 } as const, /Try again in 10 min/u],
    [{ kind: 'error', code: 'NETWORK' } as const, /didn’t send/u],
  ])('explains a send failure (%o)', async (outcome: SendOtpOutcome, line) => {
    await sendCode(withAuth({ sendOtp: () => Promise.resolve(outcome) }));
    expect(screen.getByTestId('phone-problem')).toHaveTextContent(line);
  });

  it('rejects a number that is too short before sending', async () => {
    await sendCode(fakeServices(), '12');
    expect(screen.getByTestId('phone-problem')).toHaveTextContent(/looks short/u);
  });

  it.each([
    [{ kind: 'invalid_code' } as const, /doesn’t match/u],
    [{ kind: 'expired_code' } as const, /expired/u],
    [{ kind: 'too_many_attempts' } as const, /Too many tries/u],
  ])('explains a wrong code (%o)', async (outcome: VerifyOtpOutcome, line) => {
    await sendCode(withAuth({ verifyOtp: () => Promise.resolve(outcome) }));
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '000000');
    await flush();
    expect(screen.getByTestId('phone-problem')).toHaveTextContent(line);
    await activate(screen.getByTestId('phone-change'));
    expect(screen.getByTestId('phone-send')).toBeTruthy();
  });

  it('signs a returning user in to their pass', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ mode: 'returning' });
    clearDraftForTests();
    const services = withAuth({
      verifyOtp: () => Promise.resolve({ kind: 'merge_required', ticket: 't-9' }),
    });
    await sendCode(services);
    expect(screen.getByText('WELCOME BACK')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Verification code'), '419203');
    await flush();
    await activate(screen.getByTestId('merge-use-existing'));
    await flush();
    expect(isOnboardingComplete()).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
