/**
 * Remote diagnosis for auth flows that end on the generic "That didn't work" state: the server's
 * error code (or the native module's) goes to Sentry as a tagged warning. Codes only, never the
 * phone number, email, token or user id.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Sentry tags and error codes, never copy. */
import * as Sentry from '@sentry/react-native';

export type AuthFlow =
  | 'link_apple'
  | 'link_google'
  | 'send_otp'
  | 'verify_otp'
  | 'returning_phone'
  | 'merge_start'
  | 'merge_confirm';

export interface AuthFailure {
  readonly flow: AuthFlow;
  readonly code: string;
}

export type AuthFailureReporter = (failure: AuthFailure) => void;

export const reportAuthFailureToSentry: AuthFailureReporter = ({ flow, code }) => {
  Sentry.captureMessage(`auth ${flow} failed: ${code}`, {
    level: 'warning',
    tags: { 'auth.flow': flow, 'auth.error_code': code },
    fingerprint: ['auth-failure', flow, code],
  });
};

const ERROR_CODE = /^[A-Za-z0-9_.-]{1,64}$/;

/** A thrown error's `code` when it looks like an error code (native modules set one); never its message. */
function thrownCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : 'THROWN';
}

/** Reports `{kind: 'error'}` outcomes and rejections, then passes the result through unchanged. */
export async function reportingFailures<T extends { readonly kind: string }>(
  flow: AuthFlow,
  report: AuthFailureReporter,
  run: () => Promise<T>,
): Promise<T> {
  let outcome: T;
  try {
    outcome = await run();
  } catch (error) {
    report({ flow, code: thrownCode(error) });
    throw error;
  }
  if (outcome.kind === 'error') {
    const code = (outcome as { readonly code?: unknown }).code;
    report({ flow, code: typeof code === 'string' ? code : 'UNKNOWN' });
  }
  return outcome;
}
