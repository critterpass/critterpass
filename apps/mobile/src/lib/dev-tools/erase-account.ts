/**
 * Asks the server to erase the caller's own account now (`POST /v1/me/deletion/purge-now`), for
 * "Start fresh" in Developer tools. The server refuses in production; a server without the route
 * answers 404, and the caller then decides whether to go on with the account left behind.
 */
import type { EraseOutcome } from './start-fresh';

export const PURGE_NOW_PATH = '/v1/me/deletion/purge-now';

export interface EraseAccountDeps {
  readonly baseUrl: string;
  /** The session to act as (its cookie). */
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly fetch: (
    url: string,
    init: { method: 'POST'; headers: Record<string, string>; body: string },
  ) => Promise<{ readonly status: number; json(): Promise<unknown> }>;
}

interface WireError {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly detail?: { readonly reason?: string };
  };
}

/** Throws with the server's reason for anything but erased, no such route, or no session. */
export async function eraseAccount(deps: EraseAccountDeps): Promise<EraseOutcome> {
  const response = await deps.fetch(`${deps.baseUrl}${PURGE_NOW_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await deps.sessionHeaders()) },
    body: '{}',
  });
  if (response.status === 404) return 'unavailable';
  if (response.status === 401) return 'signed_out';
  const body = (await response.json().catch(() => null)) as
    (WireError & { readonly purged?: boolean }) | null;
  if (response.status === 200 && body?.purged === true) return 'erased';
  const code = body?.error?.code ?? `HTTP ${response.status}`;
  const reason = body?.error?.detail?.reason;
  const said = body?.error?.message ?? 'the server did not erase the account';
  throw new Error(`${code}${reason === undefined ? '' : ` (${reason})`}: ${said}`);
}
