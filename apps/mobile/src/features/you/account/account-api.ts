/**
 * The account's state on the server (`GET /v1/me/account`) and the two commands that change it.
 * A server that does not have the route yet answers 404: the Account section then stays hidden,
 * so nothing is offered that cannot be done.
 */
/* eslint-disable lingui/no-unlocalized-strings -- paths, header names and command names, never copy. */
import {
  accountStateSchema,
  deletionPreflightSchema,
  type AccountState,
  type DeletionPreflight,
} from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';

export const ACCOUNT_PATH = '/v1/me/account';
const READ_TIMEOUT_MS = 8000;

export type AccountRead =
  | { readonly kind: 'ok'; readonly state: AccountState }
  /** No such route on this server, or it could not be reached. */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'signed_out' };

export interface AccountReadDeps {
  readonly baseUrl: string;
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly fetch: typeof fetch;
}

export async function readAccountState(deps: AccountReadDeps): Promise<AccountRead> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await deps.fetch(`${deps.baseUrl}${ACCOUNT_PATH}`, {
      headers: { accept: 'application/json', ...(await deps.sessionHeaders()) },
      signal: controller.signal,
    });
    if (response.status === 401) return { kind: 'signed_out' };
    if (response.status !== 200) return { kind: 'unavailable' };
    const parsed = accountStateSchema.safeParse(await response.json());
    return parsed.success ? { kind: 'ok', state: parsed.data } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export const PREFLIGHT_PATH = '/v1/me/deletion/preflight';

/** The 3n-9 numbers; null when the server cannot be reached (the page then shows the plain lists). */
export async function readDeletionPreflight(
  deps: AccountReadDeps,
): Promise<DeletionPreflight | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await deps.fetch(`${deps.baseUrl}${PREFLIGHT_PATH}`, {
      headers: { accept: 'application/json', ...(await deps.sessionHeaders()) },
      signal: controller.signal,
    });
    if (response.status !== 200) return null;
    const parsed = deletionPreflightSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Both need the server's answer before anything on the phone changes: never queued. */
export const requestAccountDeletionCommand = defineClientCommand<Record<string, never>>({
  name: 'request_account_deletion',
  offline: false,
});

export const restoreAccountCommand = defineClientCommand<Record<string, never>>({
  name: 'restore_account',
  offline: false,
});

export interface ClosedAccount {
  /** When the account is erased; null when it was erased at once (nothing to sign back into). */
  readonly purgeAt: string | null;
}

/** Reads `request_account_deletion`'s result. */
export function closedAccountOf(result: unknown): ClosedAccount {
  const value = (result ?? {}) as { purge_at?: unknown; instant?: unknown };
  if (value.instant === true || typeof value.purge_at !== 'string') return { purgeAt: null };
  return { purgeAt: value.purge_at };
}
