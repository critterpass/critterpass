/**
 * `ensureAnonymous()` (docs/api-contracts.md §5.1 `POST /api/auth/sign-in/anonymous`; Architecture
 * table): every install gets an anonymous uid on first launch, attested. `useSession` itself is the
 * real client's own reactive hook (`@better-auth/expo`'s nanostores-backed `client.useSession`,
 * wired in client.ts) — there is nothing of this app's own to unit-test there, so only the
 * ensure-anonymous decision lives in this file.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); the one literal is a developer-facing Error message, never rendered copy. */

export interface AnonymousSessionClient {
  getSession(): Promise<{ data: { user: { id: string } } | null }>;
  signInAnonymous(): Promise<{
    data: { user: { id: string } } | null;
    error: { code?: string } | null;
  }>;
}

export interface EnsureAnonymousResult {
  readonly userId: string;
  /** `false` when an existing session (anonymous or registered) was reused instead of creating one. */
  readonly created: boolean;
}

/** Idempotent: a caller can call this on every app launch without worrying whether a session already exists. */
export async function ensureAnonymous(
  client: AnonymousSessionClient,
): Promise<EnsureAnonymousResult> {
  const existing = await client.getSession();
  if (existing.data) return { userId: existing.data.user.id, created: false };

  const { data, error } = await client.signInAnonymous();
  if (error || !data) {
    throw new Error(`failed to create anonymous session: ${error?.code ?? 'UNKNOWN'}`);
  }
  return { userId: data.user.id, created: true };
}
