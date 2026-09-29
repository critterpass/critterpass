/**
 * OAuth `state` for calendar connections, bound to the session that started the flow: the
 * signed-in user and the device their app runs on, the provider, the PKCE verifier and the
 * tentative opt-in. Kept in Redis for ten minutes and consumed exactly once, so a code can only be
 * completed by the same user on the same device that asked for it (a link someone else started
 * cannot attach their calendar to you, or yours to them).
 */
import { randomBytes } from 'node:crypto';

import { DomainError, type OAuthCalendarProvider } from '@cp/domain';
import { z } from 'zod';

export const OAUTH_STATE_TTL_SECONDS = 600;

export interface OAuthStateStore {
  set(key: string, value: string, options: { EX: number; NX: true }): Promise<unknown>;
  getDel(key: string): Promise<string | null>;
  get(key: string): Promise<string | null>;
}

const stateRecordSchema = z.object({
  uid: z.uuid(),
  device_id: z.string().min(1).max(128),
  provider: z.enum(['google', 'microsoft']),
  verifier: z.string().min(43).max(128),
  consent_tentative: z.boolean(),
});
export type OAuthStateRecord = z.infer<typeof stateRecordSchema>;

const key = (state: string) => `calendar-oauth:${state}`;

export async function createOAuthState(
  store: OAuthStateStore,
  record: OAuthStateRecord,
): Promise<string> {
  const state = randomBytes(24).toString('base64url');
  await store.set(key(state), JSON.stringify(record), { EX: OAUTH_STATE_TTL_SECONDS, NX: true });
  return state;
}

/** Whether `state` is live for `provider` (the browser callback checks this, consuming nothing). */
export async function peekOAuthState(
  store: OAuthStateStore,
  state: string,
  provider: OAuthCalendarProvider,
): Promise<boolean> {
  const raw = await store.get(key(state));
  if (raw === null) return false;
  const parsed = stateRecordSchema.safeParse(JSON.parse(raw));
  return parsed.success && parsed.data.provider === provider;
}

/**
 * Consumes `state` for the completing session. Anything but the same user, device and provider is
 * `FORBIDDEN`; an unknown or expired state is `STATE_INVALID`.
 */
export async function consumeOAuthState(
  store: OAuthStateStore,
  state: string,
  expected: { uid: string; deviceId: string; provider: OAuthCalendarProvider },
): Promise<OAuthStateRecord> {
  const raw = await store.getDel(key(state));
  if (raw === null) throw new DomainError('STATE_INVALID', { reason: 'oauth_state_expired' });
  const record = stateRecordSchema.parse(JSON.parse(raw));
  if (
    record.uid !== expected.uid ||
    record.device_id !== expected.deviceId ||
    record.provider !== expected.provider
  ) {
    throw new DomainError('FORBIDDEN', { reason: 'oauth_state_mismatch' });
  }
  return record;
}
