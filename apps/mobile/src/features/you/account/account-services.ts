/**
 * What the account screens need from the device, in one object so screens take the real one by
 * default and tests and lab scenes pass their own.
 */
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { readAccountState, type AccountRead } from './account-api';
import { clearThisPhone, type ClearReason, type ClearResult } from './clear-phone';
import { deviceWipePorts, markResumeSignIn } from './device-wipe';

export interface AccountServices {
  readonly readAccount: () => Promise<AccountRead>;
  /**
   * Whether this pass can be signed back into: it has a phone number or a linked sign-in. An
   * unsaved pass is erased for good by a sign-out, so its owner is told first.
   */
  readonly passSaved: () => Promise<boolean>;
  readonly clearPhone: (reason: ClearReason, then?: 'sign_in') => Promise<ClearResult>;
}

interface SessionUser {
  readonly isAnonymous?: boolean | null;
  readonly phoneNumber?: string | null;
}

/** Saved means a way back in: not anonymous, or anonymous with a verified phone number. */
export function isSavedPass(user: SessionUser | null | undefined): boolean {
  if (user === null || user === undefined) return false;
  if (user.isAnonymous !== true) return true;
  return typeof user.phoneNumber === 'string' && user.phoneNumber.length > 0;
}

export const deviceAccountServices: AccountServices = {
  async readAccount() {
    const { sessionHeaders } = await import('@/data/app-session/auth-client');
    return readAccountState({ baseUrl: resolveApiBaseUrl(), sessionHeaders, fetch });
  },
  async passSaved() {
    const { authClient } = await import('@/data/app-session/auth-client');
    const session = (await authClient().getSession()) as {
      data?: { user?: SessionUser } | null;
    };
    return isSavedPass(session.data?.user);
  },
  clearPhone: (reason, then) =>
    clearThisPhone(
      deviceWipePorts,
      reason,
      then === 'sign_in' ? { beforeRestart: markResumeSignIn } : {},
    ),
};
