import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { deviceLastUid } from '@/data/app-session/last-uid-store';
import { createAuthDataLayer } from '@/data/auth';
import type {
  AuthFailure,
  MobileAuthClient,
  NativeIdTokenProvider,
  SendOtpOutcome,
  VerifyOtpOutcome,
} from '@/data/auth';
import { isOnboardingComplete, setOnboardingComplete } from '@/lib/links/pending';

import { clearDraftForTests, readDraft, updateDraft } from '../flow-controller/draft-store';
import { PremiumIssuedPage } from '../premium/issued/PremiumIssuedPage';
import { PremiumPhonePage } from '../premium/phone/PremiumPhonePage';
import { PHONE_ADVANCE_MS } from '../phone/use-phone-step';
import { countryList, formatE164, resendWaitS, toE164 } from '../phone/phone-number';
import { PremiumSavePage } from '../premium/save/PremiumSavePage';
import { fakeServices, recordingAnalytics, renderOnboarding } from '../test-support/harness';
import type { OnboardingServices } from '../services';

/** The code's own field (its boxes are a button that focuses it). */
const codeField = () => screen.getAllByLabelText('Verification code').at(-1)!;
const activate = (element: Parameters<typeof fireEvent.press>[0]) => fireEvent.press(element);

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
  jest.mocked(router.back).mockClear();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  jest.mocked(router.canGoBack).mockReturnValue(true);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('3a-6 pass issued', () => {
  it('prints the finished pass with SYNCING until the number arrives', async () => {
    const analytics = recordingAnalytics();
    await renderOnboarding(<PremiumIssuedPage />, { analytics });
    expect(screen.getByTestId('onboarding-pass-number')).toHaveTextContent(/CP-····.*syncing/iu);
    expect(analytics.events.map((e) => e.event)).toContain('pass_issued');
    await activate(screen.getByTestId('onboarding-issued-save'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/save');
  });

  it('leads on instead of offering to save again once the pass is saved', async () => {
    updateDraft((d) => ({ ...d, saved: true, step: 'saved' }));
    await renderOnboarding(<PremiumIssuedPage />);
    expect(screen.getByTestId('pass-saved-tick')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-issued-save')).toBeNull();
    await activate(screen.getByTestId('onboarding-issued-next'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/permissions');
  });

  it('shows the reserved number once it is on the pass', async () => {
    updateDraft((d) => ({ ...d, number: 'CP-0427' }));
    await renderOnboarding(<PremiumIssuedPage />);
    expect(screen.getByTestId('onboarding-pass-number')).toHaveTextContent('CP-0427');
    expect(screen.getByTestId('onboarding-pass-number')).not.toHaveTextContent(/syncing/iu);
  });
});

function withAuth(auth: Partial<OnboardingServices['auth']>): OnboardingServices {
  const base = fakeServices();
  return { ...base, auth: { ...base.auth, ...auth } };
}

/**
 * The real auth data layer over a Google sheet that stops with `code` (as the device's Google
 * provider throws it): the client is never reached, so it is an empty stand-in.
 */
function googleStopping(code: string) {
  const reported: AuthFailure[] = [];
  const layer = createAuthDataLayer({} as unknown as MobileAuthClient, {
    apiBaseUrl: 'https://api.test',
    reportFailure: (failure) => void reported.push(failure),
  });
  const google: NativeIdTokenProvider = {
    requestIdToken: () => Promise.reject(Object.assign(new Error(code), { code })),
  };
  const services = { ...withAuth({ linkGoogle: layer.linkGoogle }), google };
  return { services, reported };
}

describe('3a-7 save your pass', () => {
  it('links Google, ticks SAVED and moves on to permissions', async () => {
    jest.useFakeTimers();
    await renderOnboarding(<PremiumSavePage />);
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
    await renderOnboarding(<PremiumSavePage />, {
      services: withAuth({ linkGoogle: () => Promise.resolve(outcome) }),
    });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.getByTestId('save-error')).toHaveTextContent(line);
  });

  it('stays put when the provider sheet is cancelled', async () => {
    await renderOnboarding(<PremiumSavePage />, {
      services: withAuth({ linkGoogle: () => Promise.resolve({ kind: 'cancelled' }) }),
    });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.queryByTestId('save-error')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('explains and reports a Google sheet that ended without an account', async () => {
    const { services, reported } = googleStopping('SIGN_IN_CANCELLED');
    await renderOnboarding(<PremiumSavePage />, { services });
    await activate(screen.getByTestId('save-google'));
    await flush();
    expect(screen.getByTestId('save-error')).toHaveTextContent(/Google sign-in didn’t finish/u);
    expect(reported).toEqual([{ flow: 'link_google', code: 'SIGN_IN_CANCELLED' }]);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('goes back to where it was opened for someone who already has a pass', async () => {
    jest.useFakeTimers();
    setOnboardingComplete(true);
    await renderOnboarding(<PremiumSavePage />);
    await activate(screen.getByTestId('save-google'));
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('returns from “Not now” without walking a finished pass through permissions', async () => {
    setOnboardingComplete(true);
    await renderOnboarding(<PremiumSavePage />);
    await activate(screen.getByTestId('save-not-now'));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('waits for a sign-in still working when the sheet is closed, and records the account', async () => {
    jest.useFakeTimers();
    let answer: (outcome: { kind: 'linked' }) => void = () => undefined;
    const linkGoogle = () => new Promise<{ kind: 'linked' }>((resolve) => (answer = resolve));
    await renderOnboarding(<PremiumSavePage />, { services: withAuth({ linkGoogle }) });
    await activate(screen.getByTestId('save-google'));
    await fireEvent.press(screen.getByTestId('save-sheet-scrim', { includeHiddenElements: true }));
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    // Closing the sheet is not "Not now" while Google is still answering.
    expect(router.replace).not.toHaveBeenCalled();
    answer({ kind: 'linked' });
    await flush();
    expect(readDraft()?.saved).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(router.replace).toHaveBeenCalledWith('/onboarding/permissions');
  });

  it('lets the user skip saving for now', async () => {
    await renderOnboarding(<PremiumSavePage />);
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

  it('names countries even where the runtime only knows the codes', () => {
    const names = { VN: 'Vietnam', SG: 'Singapore' } as Record<string, string>;
    const list = countryList('en', (code) => names[code]);
    const vn = list.find((row) => row.code === 'VN');
    expect(vn?.dial).toBe('84');
    expect(vn?.name).not.toBe('VN');
    expect(list.every((row) => row.name.length > 0)).toBe(true);
  });

  async function sendCode(services: OnboardingServices, number = '91234567') {
    await renderOnboarding(<PremiumPhonePage />, { services });
    await fireEvent.changeText(screen.getByTestId('phone-number'), number);
    await activate(screen.getByTestId('phone-send'));
    await flush();
  }

  it('sends the code on WhatsApp, verifies it and goes back to its caller after the clap', async () => {
    jest.useFakeTimers();
    const analytics = recordingAnalytics();
    await renderOnboarding(<PremiumPhonePage />, { analytics });
    await fireEvent.changeText(screen.getByTestId('phone-number'), '91234567');
    await activate(screen.getByTestId('phone-send'));
    await flush();
    expect(screen.getByTestId('phone-sent')).toHaveTextContent(
      'Code sent to +65 9123 4567 on WhatsApp',
    );
    expect(screen.getByTestId('phone-resend')).toHaveTextContent(/30/u);
    await fireEvent.changeText(codeField(), '419203');
    await flush();
    expect(readDraft()?.saved).toBe(true);
    expect(router.back).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(2200);
      await Promise.resolve();
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(analytics.events.filter((e) => e.event === 'account_saved')).toEqual([
      { event: 'account_saved', props: { provider: 'phone' } },
    ]);
  });

  it('ends the regular path on permissions: the save page sees the number the phone page verified', async () => {
    jest.useFakeTimers();
    // The stack as the app has it: the save page stays mounted under the phone page it pushed.
    await renderOnboarding(
      <>
        <PremiumSavePage />
        <PremiumPhonePage />
      </>,
    );
    await fireEvent.changeText(screen.getByTestId('phone-number'), '91234567');
    await activate(screen.getByTestId('phone-send'));
    await flush();
    await fireEvent.changeText(codeField(), '419203');
    await flush();
    expect(screen.getByTestId('pass-saved-tick')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(PHONE_ADVANCE_MS);
      await Promise.resolve();
    });
    expect(readDraft()?.step).toBe('saved');
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
    await fireEvent.changeText(codeField(), '000000');
    await flush();
    expect(screen.getByTestId('phone-problem')).toHaveTextContent(line);
    await activate(screen.getByTestId('phone-change'));
    expect(screen.getByTestId('phone-send')).toBeTruthy();
  });

  it('empties the boxes after a wrong code, so the next six digits are checked', async () => {
    const answers: VerifyOtpOutcome[] = [{ kind: 'invalid_code' }, { kind: 'verified' }];
    const verifyOtp = jest.fn((): Promise<VerifyOtpOutcome> =>
      Promise.resolve(answers.shift() ?? { kind: 'verified' }),
    );
    await sendCode(withAuth({ verifyOtp }));
    await fireEvent.changeText(codeField(), '000000');
    await flush();
    expect(screen.getByTestId('phone-problem')).toHaveTextContent(/doesn’t match/u);
    expect(codeField()).toHaveProp('value', '');
    await fireEvent.changeText(codeField(), '419203');
    await flush();
    expect(verifyOtp).toHaveBeenLastCalledWith(expect.objectContaining({ code: '419203' }));
    expect(screen.queryByTestId('phone-problem')).toBeNull();
    expect(readDraft()?.saved).toBe(true);
  });

  it('checks the same code again when the check never reached the server', async () => {
    const answers: VerifyOtpOutcome[] = [{ kind: 'error', code: 'NETWORK' }, { kind: 'verified' }];
    const verifyOtp = jest.fn((): Promise<VerifyOtpOutcome> =>
      Promise.resolve(answers.shift() ?? { kind: 'verified' }),
    );
    await sendCode(withAuth({ verifyOtp }));
    await fireEvent.changeText(codeField(), '419203');
    await flush();
    // Not the line about a code that was never sent: the code arrived, the check did not.
    expect(screen.getByTestId('phone-problem')).toHaveTextContent(/couldn’t check that code/u);
    expect(codeField()).toHaveProp('value', '419203');
    await activate(screen.getByTestId('phone-verify-retry'));
    await flush();
    expect(verifyOtp).toHaveBeenCalledTimes(2);
    expect(verifyOtp).toHaveBeenLastCalledWith(expect.objectContaining({ code: '419203' }));
    expect(screen.queryByTestId('phone-problem')).toBeNull();
    expect(readDraft()?.saved).toBe(true);
  });

  it('tells a returning user when Google sign-in stops, instead of just resetting the button', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ mode: 'returning' });
    const { services, reported } = googleStopping('SIGN_IN_CANCELLED');
    await renderOnboarding(<PremiumPhonePage />, { services });
    await activate(screen.getByTestId('phone-google'));
    await flush();
    expect(screen.getByTestId('phone-save-error')).toHaveTextContent(
      /Google sign-in didn’t finish/u,
    );
    expect(reported).toEqual([{ flow: 'link_google', code: 'SIGN_IN_CANCELLED' }]);
  });

  it('says Google sign-in is unavailable on a phone without Play services', async () => {
    const { services, reported } = googleStopping('PLAY_SERVICES_NOT_AVAILABLE');
    await renderOnboarding(<PremiumPhonePage />, { services });
    await activate(screen.getByTestId('phone-google'));
    await flush();
    expect(screen.getByTestId('phone-save-error')).toHaveTextContent(/isn’t available/u);
    expect(reported).toEqual([{ flow: 'link_google', code: 'PLAY_SERVICES_NOT_AVAILABLE' }]);
  });

  it('signs a returning user in to the pass their number holds, without saving it here', async () => {
    jest.useFakeTimers();
    jest.mocked(useLocalSearchParams).mockReturnValue({ mode: 'returning' });
    clearDraftForTests();
    const verifyOtp = jest.fn(() => Promise.resolve({ kind: 'verified' } as const));
    const signInReturningPhone = jest.fn(() =>
      Promise.resolve({ kind: 'signed_in', userId: 'u-existing' } as const),
    );
    const restart = jest.fn();
    const services = { ...withAuth({ verifyOtp, signInReturningPhone }), restart };
    await sendCode(services);
    expect(screen.getByText(/^Welcome\s+back$/u)).toBeTruthy();
    await fireEvent.changeText(codeField(), '419203');
    await flush();
    expect(signInReturningPhone).toHaveBeenCalledWith(expect.objectContaining({ code: '419203' }));
    // The save call would move the number onto this phone's new pass: never made here.
    expect(verifyOtp).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(PHONE_ADVANCE_MS);
      await Promise.resolve();
    });
    expect(isOnboardingComplete()).toBe(true);
    expect(restart).toHaveBeenCalledTimes(1);
    // The restart opens the account signed in to, not this phone's fresh pass first.
    expect(deviceLastUid.read()).toBe('u-existing');
  });

  it('makes a new pass on a number nobody holds, saved to this phone', async () => {
    jest.useFakeTimers();
    jest.mocked(useLocalSearchParams).mockReturnValue({ mode: 'returning' });
    clearDraftForTests();
    const restart = jest.fn();
    const services = {
      ...withAuth({ signInReturningPhone: () => Promise.resolve({ kind: 'linked' } as const) }),
      restart,
    };
    await sendCode(services);
    await fireEvent.changeText(codeField(), '419203');
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(PHONE_ADVANCE_MS);
      await Promise.resolve();
    });
    expect(router.replace).toHaveBeenCalledWith('/onboarding/name');
    expect(restart).not.toHaveBeenCalled();
    expect(isOnboardingComplete()).toBe(false);
  });
});
