/**
 * Returning-user sign-in (undesigned splash "I have an account" entry; docs/api-contracts.md §5.1
 * `POST /api/auth/sign-in/phone-number`, `POST /sign-in/social`). `decideReturningFlow` is the pure
 * local-data check this phase's Architecture table calls for ("decide sign-in vs merge-ticket by
 * local anonymous data presence") — no network, no auth client, trivially unit-testable; the caller
 * (phase 22's screen) branches on its result before ever calling a network flow function.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, error code or outcome discriminant, never rendered copy. */
import type { ReturningSignInOutcome } from './types';

/** What phase 22's screen already knows locally before it offers "I have an account". */
export interface LocalAnonymousDataPresence {
  /** True once `/sign-in/anonymous` has ever run on this install (a local pass exists at all). */
  readonly hasAnonymousSession: boolean;
  /** True if the local anonymous uid is a member of at least one crew (docs/data-model-sync-and-privacy.md §4: local-first data worth not losing). */
  readonly hasCrews: boolean;
}

export type ReturningFlowDecision =
  | { readonly kind: 'sign_in_directly' }
  | { readonly kind: 'sign_in_then_gc_anonymous' }
  | { readonly kind: 'merge_ticket_path' };

/**
 * No anonymous session yet → sign in directly (`sign_in_directly`). An anonymous session with no
 * crews (nothing worth losing) → still sign in as the returning user, then let `maint.anon_gc`
 * (phase 11) reap the empty anonymous uid later (`sign_in_then_gc_anonymous`) — never delete it here
 * synchronously, since sign-in itself does not touch the anonymous uid at all. An anonymous session
 * with crews → the merge-ticket path must run first: signing in directly would silently orphan that
 * data (docs/data-model.md §3.1 "Second device": "sign-in required (Q-10); same flow as returning
 * user").
 */
export function decideReturningFlow(local: LocalAnonymousDataPresence): ReturningFlowDecision {
  if (!local.hasAnonymousSession) return { kind: 'sign_in_directly' };
  return local.hasCrews ? { kind: 'merge_ticket_path' } : { kind: 'sign_in_then_gc_anonymous' };
}

interface WireErrorShape {
  readonly status?: number;
  readonly code?: string;
  readonly detail?: { readonly retry_after_s?: number };
}

export interface ReturningPhoneSignInResponse {
  readonly user: { readonly id: string };
}

export interface ReturningPhoneSignInClient {
  post(
    path: '/api/auth/sign-in/phone-number',
    body: { phoneNumber: string; code: string },
  ): Promise<{ data: ReturningPhoneSignInResponse | null; error: WireErrorShape | null }>;
}

/** `POST /api/auth/sign-in/phone-number` (services/api/src/routes/auth-extra.ts): never called from an anonymous session — the caller runs `decideReturningFlow` first. */
export async function signInReturningPhone(
  input: { phoneNumber: string; code: string },
  client: ReturningPhoneSignInClient,
): Promise<ReturningSignInOutcome> {
  const { data, error } = await client.post('/api/auth/sign-in/phone-number', input);
  if (!error) {
    return data ? { kind: 'signed_in', userId: data.user.id } : { kind: 'error', code: 'UNKNOWN' };
  }
  if (error.status === 404) return { kind: 'no_account' };
  if (error.status === 429) {
    const retryAfterS = error.detail?.retry_after_s;
    return retryAfterS === undefined
      ? { kind: 'rate_limited' }
      : { kind: 'rate_limited', retryAfterS };
  }
  if (error.code === 'VALIDATION') return { kind: 'invalid_code' };
  return { kind: 'error', code: error.code ?? 'UNKNOWN' };
}
