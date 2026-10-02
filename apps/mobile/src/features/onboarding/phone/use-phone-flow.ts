/**
 * The phone sign-in steps (3a-8): number → code sent (WhatsApp or SMS) → verify, with the resend
 * wait growing 30 → 60 → 120 s, and every answer the OTP routes give turned into a named problem.
 * A verified number (or one that already has a pass) goes to the save flow. A returning sign-in
 * ("I already have a pass") signs in to the account that holds the number instead of saving it to
 * the pass this phone is on; a number nobody holds is saved here, as a new pass would.
 */
/* eslint-disable lingui/no-unlocalized-strings -- state discriminants and error codes, never copy. */
import { useEffect, useState } from 'react';

import type { ReturningSignInOutcome, SendOtpOutcome, VerifyOtpOutcome } from '@/data/auth';
import { feedback } from '@/motion/feedback';
import type { CodeStatus } from '@/ui/inputs/CodeBoxes';

import type { useSaveFlow } from '../save/use-save-flow';
import type { OnboardingAuth } from '../services';
import { formatNational, resendWaitS, toE164, typedNumber } from './phone-number';

export type PhoneProblem =
  | 'invalid_number'
  | 'country_unsupported'
  | 'rate_limited'
  | 'send_failed'
  | 'wrong_code'
  | 'expired'
  | 'too_many';

export interface PhoneFlowDeps {
  readonly auth: Pick<OnboardingAuth, 'sendOtp' | 'verifyOtp' | 'signInReturningPhone'>;
  readonly save: ReturnType<typeof useSaveFlow>;
  /** Set for "I already have a pass": called once the phone is signed in to its existing account. */
  readonly returning?: { readonly onSignedIn: () => void } | undefined;
}

export function usePhoneFlow({ auth, save, returning }: PhoneFlowDeps, initialCountry: string) {
  const [country, setCountry] = useState(initialCountry);
  const [number, setNumber] = useState('');
  const [sent, setSent] = useState<{ e164: string; channel: 'whatsapp' | 'sms' } | null>(null);
  const [sends, setSends] = useState(0);
  const [waitS, setWaitS] = useState(0);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<CodeStatus>('idle');
  const [problem, setProblem] = useState<{ kind: PhoneProblem; retryS: number | null } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (waitS <= 0) return undefined;
    const timer = setTimeout(() => setWaitS((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitS]);

  const send = async () => {
    const e164 = toE164(country, number);
    if (e164 === null) {
      setProblem({ kind: 'invalid_number', retryS: null });
      return;
    }
    setBusy(true);
    setProblem(null);
    const outcome: SendOtpOutcome = await auth
      .sendOtp(e164)
      .catch(() => ({ kind: 'error', code: 'NETWORK' }) as const);
    setBusy(false);
    if (outcome.kind === 'sent') {
      setSent({ e164, channel: outcome.channel });
      setSends((n) => n + 1);
      setWaitS(resendWaitS(sends + 1));
      setCode('');
      setStatus('idle');
    } else if (outcome.kind === 'country_unsupported') {
      setProblem({ kind: 'country_unsupported', retryS: null });
    } else if (outcome.kind === 'rate_limited') {
      setProblem({ kind: 'rate_limited', retryS: outcome.retryAfterS });
    } else {
      setProblem({ kind: 'send_failed', retryS: null });
    }
  };

  const signInAgain = async (phoneNumber: string, entered: string, onSignedIn: () => void) => {
    setBusy(true);
    const outcome: ReturningSignInOutcome = await auth
      .signInReturningPhone({ phoneNumber, code: entered })
      .catch(() => ({ kind: 'error', code: 'NETWORK' }) as const);
    setBusy(false);
    switch (outcome.kind) {
      case 'signed_in':
        setStatus('valid');
        feedback.emit('success');
        onSignedIn();
        return;
      case 'linked':
        setStatus('valid');
        feedback.emit('success');
        await save.handle('phone', { kind: 'linked' });
        return;
      case 'invalid_code':
        setStatus('invalid');
        setProblem({ kind: 'wrong_code', retryS: null });
        return;
      case 'rate_limited':
        setStatus('invalid');
        setProblem({ kind: 'too_many', retryS: outcome.retryAfterS ?? null });
        return;
      case 'no_account':
      case 'error':
        setStatus('idle');
        setProblem({ kind: 'send_failed', retryS: null });
    }
  };

  const verify = async (entered: string) => {
    if (sent === null) return;
    if (returning !== undefined) {
      await signInAgain(sent.e164, entered, returning.onSignedIn);
      return;
    }
    setBusy(true);
    const outcome: VerifyOtpOutcome = await auth
      .verifyOtp({ phoneNumber: sent.e164, code: entered })
      .catch(() => ({ kind: 'error', code: 'NETWORK' }) as const);
    setBusy(false);
    switch (outcome.kind) {
      case 'verified':
        setStatus('valid');
        feedback.emit('success');
        await save.handle('phone', { kind: 'linked' });
        return;
      case 'merge_required':
        setStatus('valid');
        await save.handle('phone', outcome);
        return;
      case 'invalid_code':
        setStatus('invalid');
        setProblem({ kind: 'wrong_code', retryS: null });
        return;
      case 'expired_code':
        setStatus('invalid');
        setProblem({ kind: 'expired', retryS: null });
        return;
      case 'too_many_attempts':
        setStatus('invalid');
        setProblem({ kind: 'too_many', retryS: null });
        return;
      case 'error':
        setStatus('idle');
        setProblem({ kind: 'send_failed', retryS: null });
    }
  };

  const changeNumber = () => {
    setSent(null);
    setCode('');
    setStatus('idle');
    setProblem(null);
  };

  return {
    country,
    /** A new country regroups the digits already typed. */
    setCountry: (next: string) => {
      setCountry(next);
      setNumber((typed) => formatNational(next, typed));
    },
    number,
    setNumber: (next: string) => {
      const typed = typedNumber(country, number, next);
      if (typed.country !== country) setCountry(typed.country);
      setNumber(typed.number);
      setProblem(null);
    },
    sent,
    waitS,
    code,
    setCode: (next: string) => {
      setCode(next);
      if (status === 'invalid') setStatus('idle');
    },
    status,
    problem,
    busy,
    send,
    verify,
    changeNumber,
  };
}
