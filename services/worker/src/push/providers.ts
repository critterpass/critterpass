/**
 * What a provider send can end in, and how each provider's answers map onto it
 * (docs/api-contracts-async.md §3.1, §3.3). `invalid_token` retires the token (APNs 410 and
 * `BadDeviceToken`/`DeviceTokenNotForTopic`, FCM `UNREGISTERED`/`SENDER_ID_MISMATCH`); `retry`
 * hands the job back to pg-boss (429, 5xx, a dropped connection); `rejected` is a request the
 * provider will never accept (payload too large, bad topic) and is not retried.
 */
export type PushResult =
  | { readonly outcome: 'sent'; readonly providerId?: string }
  | { readonly outcome: 'invalid_token'; readonly reason: string }
  | { readonly outcome: 'retry'; readonly reason: string; readonly retryAfterS?: number }
  | { readonly outcome: 'rejected'; readonly reason: string };

const APNS_INVALID_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
  'Unregistered',
  'ExpiredToken',
]);

/** Maps one APNs HTTP/2 response (status + `reason`) onto a result. */
export function apnsResult(
  status: number,
  reason: string | undefined,
  retryAfter?: string,
): PushResult {
  if (status >= 200 && status < 300) return { outcome: 'sent' };
  const why = reason ?? `HTTP ${status}`;
  if (status === 410 || APNS_INVALID_TOKEN_REASONS.has(why))
    return { outcome: 'invalid_token', reason: why };
  if (status === 429 || status >= 500 || why === 'ExpiredProviderToken') {
    const seconds = retryAfter === undefined ? undefined : Number(retryAfter);
    return {
      outcome: 'retry',
      reason: why,
      ...(seconds !== undefined && Number.isFinite(seconds) ? { retryAfterS: seconds } : {}),
    };
  }
  return { outcome: 'rejected', reason: why };
}

const FCM_INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/mismatched-credential',
]);
const FCM_RETRY_CODES = new Set([
  'messaging/message-rate-exceeded',
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/unknown-error',
  'app/network-error',
  'app/network-timeout',
]);

/** Maps a firebase-admin messaging error code onto a result. */
export function fcmResult(code: string | undefined, message: string): PushResult {
  if (code !== undefined && FCM_INVALID_TOKEN_CODES.has(code)) {
    return { outcome: 'invalid_token', reason: code };
  }
  if (code === undefined || FCM_RETRY_CODES.has(code)) {
    return { outcome: 'retry', reason: code ?? message };
  }
  return { outcome: 'rejected', reason: code };
}
