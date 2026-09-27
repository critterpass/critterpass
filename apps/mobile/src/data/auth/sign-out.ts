/**
 * Sign-out (docs/api-contracts.md §5.1 `POST /api/auth/sign-out`). Calling the real client's
 * `signOut()` naturally clears the SecureStore-persisted cookie: Better Auth responds with an expired
 * `Set-Cookie`, and `@better-auth/expo`'s client plugin captures every `Set-Cookie` header the same
 * way regardless of value, overwriting the stored session (verified against the installed
 * `@better-auth/expo` 1.7.6 client source — its `fetchPlugins.onSuccess` hook always calls
 * `storeCookie`, whether the response set a live cookie or an expired one). This module's own job is
 * only running the `onSignOut` hook registry after that succeeds.
 */
import { runOnSignOutHooks } from './sign-out-hooks';

export interface SignOutClient {
  signOut(): Promise<{ data: unknown; error: { code?: string } | null }>;
}

export interface SignOutResult {
  readonly signedOut: boolean;
}

/** Runs `onSignOut` hooks only after the server confirms the sign-out; a failed sign-out leaves local state untouched rather than tearing down PowerSync/local data while the server still thinks the session is live. */
export async function signOut(client: SignOutClient): Promise<SignOutResult> {
  const { error } = await client.signOut();
  if (error) return { signedOut: false };
  await runOnSignOutHooks();
  return { signedOut: true };
}
