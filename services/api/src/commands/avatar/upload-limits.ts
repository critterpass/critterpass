/**
 * Avatar upload limits (docs/api-contracts.md §5.4, 3a-3 / 3n-4): 5 avatar uploads an hour and 20
 * a day per uid and device, anonymous uids included, checked when the upload URL is minted so a
 * client that keeps retaking photos hears `RATE_LIMITED` (with `retry_after_s`) before uploading.
 * The device is the install id the app sends on every request (`x-cp-install-id`); a request
 * without one shares a single "no device" bucket for that uid.
 */
import { DomainError } from '@cp/domain';

import {
  checkRateLimit,
  type RateLimitRedisClient,
  type RateLimitRule,
} from '../../abuse/rate-limits';

export const AVATAR_UPLOADS_PER_HOUR: RateLimitRule = { windowSeconds: 3600, max: 5 };
export const AVATAR_UPLOADS_PER_DAY: RateLimitRule = { windowSeconds: 86_400, max: 20 };

const INSTALL_ID = /^[A-Za-z0-9-]{1,64}$/u;

/** The device part of the key: the install id when it looks like one, else a shared bucket. */
function deviceKey(installId: string | null | undefined): string {
  return installId !== null && installId !== undefined && INSTALL_ID.test(installId)
    ? installId
    : 'none';
}

/** Counts one avatar upload for `uid` on this device; `RATE_LIMITED` past either window. */
export async function enforceAvatarUploadLimit(
  redis: RateLimitRedisClient,
  uid: string,
  installId: string | null | undefined,
): Promise<void> {
  const key = `abuse:avatar-upload:${uid}:${deviceKey(installId)}`;
  for (const [window, rule] of [
    ['h', AVATAR_UPLOADS_PER_HOUR],
    ['d', AVATAR_UPLOADS_PER_DAY],
  ] as const) {
    const decision = await checkRateLimit(redis, `${key}:${window}`, rule);
    if (!decision.allowed) {
      throw new DomainError('RATE_LIMITED', {
        retry_after_s: decision.retryAfterS,
        limit: window === 'h' ? 'avatar_uploads_hour' : 'avatar_uploads_day',
      });
    }
  }
}
