/**
 * Phone numbers that sign in with a fixed code instead of a delivered one, for callers that can
 * never receive a message: automated device flows on staging (`OTP_TEST_NUMBERS` + `OTP_TEST_CODE`,
 * honoured only outside production) and App Review (`OTP_REVIEW_NUMBER` + `OTP_REVIEW_CODE`, one
 * explicit number that also works in production and must be rotated once a review is over).
 *
 * A fixed-code number never reaches a provider: Better Auth still creates its verification row
 * with a random code, and `useFixedCode` swaps that code for the fixed one before answering, so
 * verification, expiry and the attempt budget stay Better Auth's own. Every use is reported.
 */
export type FixedCodeKind = 'test' | 'review';

export interface FixedCodeMatch {
  readonly kind: FixedCodeKind;
  readonly code: string;
}

export interface FixedCodeNumbers {
  match(phoneE164: string): FixedCodeMatch | undefined;
}

export interface FixedCodeEnv {
  readonly APP_ENV: 'local' | 'staging' | 'production';
  readonly OTP_TEST_NUMBERS?: string | undefined;
  readonly OTP_TEST_CODE?: string | undefined;
  readonly OTP_REVIEW_NUMBER?: string | undefined;
  readonly OTP_REVIEW_CODE?: string | undefined;
}

const E164 = /^\+[1-9]\d{6,14}$/;

function parseNumbers(list: string): string[] {
  const numbers = list
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  for (const number of numbers) {
    if (!E164.test(number)) throw new Error('OTP_TEST_NUMBERS: every entry must be E.164');
  }
  return numbers;
}

/**
 * The fixed-code numbers this deployment honours, or `undefined` when there are none. A list
 * without its code (or the reverse) fails at boot rather than silently sending real codes.
 */
export function fixedCodeNumbersFromEnv(env: FixedCodeEnv): FixedCodeNumbers | undefined {
  const byNumber = new Map<string, FixedCodeMatch>();

  const testListed = env.OTP_TEST_NUMBERS !== undefined;
  if (testListed !== (env.OTP_TEST_CODE !== undefined)) {
    throw new Error('OTP_TEST_NUMBERS and OTP_TEST_CODE must be set together');
  }
  // Production never honours test numbers, whatever its variables say (the api logs that at boot).
  if (
    env.APP_ENV !== 'production' &&
    env.OTP_TEST_NUMBERS !== undefined &&
    env.OTP_TEST_CODE !== undefined
  ) {
    for (const number of parseNumbers(env.OTP_TEST_NUMBERS)) {
      byNumber.set(number, { kind: 'test', code: env.OTP_TEST_CODE });
    }
  }

  if ((env.OTP_REVIEW_NUMBER !== undefined) !== (env.OTP_REVIEW_CODE !== undefined)) {
    throw new Error('OTP_REVIEW_NUMBER and OTP_REVIEW_CODE must be set together');
  }
  if (env.OTP_REVIEW_NUMBER !== undefined && env.OTP_REVIEW_CODE !== undefined) {
    if (!E164.test(env.OTP_REVIEW_NUMBER)) throw new Error('OTP_REVIEW_NUMBER must be E.164');
    byNumber.set(env.OTP_REVIEW_NUMBER, { kind: 'review', code: env.OTP_REVIEW_CODE });
  }

  if (byNumber.size === 0) return undefined;
  return { match: (phoneE164) => byNumber.get(phoneE164) };
}

interface VerificationWriter {
  updateVerificationByIdentifier(identifier: string, data: { value: string }): Promise<unknown>;
}

function internalAdapterOf(ctx: unknown): VerificationWriter {
  const adapter = (ctx as { context?: { internalAdapter?: VerificationWriter } } | null)?.context
    ?.internalAdapter;
  if (adapter === undefined) throw new Error('send-otp context has no internal adapter');
  return adapter;
}

/**
 * Replaces the code Better Auth just stored for `phoneE164` with the fixed one, keeping the row's
 * expiry and a fresh attempt count (the plugin stores `<code>:<attempts>`).
 */
export async function useFixedCode(ctx: unknown, phoneE164: string, code: string): Promise<void> {
  await internalAdapterOf(ctx).updateVerificationByIdentifier(phoneE164, { value: `${code}:0` });
}

/** The last four digits only: enough to tell numbers apart in a log line, never the number. */
export function maskedNumber(phoneE164: string): string {
  return `…${phoneE164.slice(-4)}`;
}
