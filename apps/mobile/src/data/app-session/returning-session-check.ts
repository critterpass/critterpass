/**
 * The returning install's session check (./start-app-session.ts): the local data is already open
 * for the stored uid, and this asks the server, alongside, whose session the phone holds.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL or a developer-facing error, never copy. */
import { readPendingActions } from '@cp/domain';

import { runOnSignOutHooks } from '../auth/sign-out-hooks';
import type { ExtensionOutbox } from '../commands/drain-extension-outbox';
import { stopSyncing } from '../powersync/local-first';
import type { LocalFirstContextValue } from '../powersync/local-first-context';
import { backoffDelayMs, type BackoffPolicy } from '../powersync/upload-queue';
import type { AppSessionAuth, AppSessionDeps } from './start-app-session';

/** A Better Auth client result: a 2xx body in `data`, or the status of anything else in `error`. */
export interface SessionAnswer {
  readonly data: unknown;
  readonly error: { readonly status?: number } | null;
}

/** How long one session check may take, and how soon a check that got no answer asks again. */
export interface SessionCheckPolicy {
  readonly timeoutMs: number;
  readonly backoff: BackoffPolicy;
}

export const SESSION_CHECK: SessionCheckPolicy = {
  timeoutMs: 15_000,
  backoff: { baseMs: 5_000, maxMs: 300_000, random: Math.random },
};

type SessionCheckDeps = Pick<
  AppSessionDeps,
  'lastUid' | 'outbox' | 'onError' | 'restart' | 'sessionCheck'
> & { readonly auth: Pick<AppSessionAuth, 'getSession'> };

type SessionHolder = { readonly userId: string } | null;

/**
 * The holder an answer names: a user, or `null` for the server's plain "no session" (a 2xx with
 * no body). Anything else is no answer at all, never "no one": a 5xx or 4xx, a gateway's error
 * page, a captive portal's 200 page, a body without a user id.
 */
export function readSessionAnswer(answer: SessionAnswer): SessionHolder | undefined {
  if (answer.error !== null) return undefined;
  if (answer.data === null) return null;
  const userId: unknown =
    typeof answer.data === 'object' && answer.data !== null
      ? (answer.data as { user?: { id?: unknown } }).user?.id
      : undefined;
  return typeof userId === 'string' ? { userId } : undefined;
}

/** Resolves after `ms`, or as soon as `halt` aborts. */
function pause(ms: number, halt: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      halt.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    halt.addEventListener('abort', done, { once: true });
  });
}

/** One check: the holder named, or undefined when no answer came within the policy's time. */
function askWhoseSession(
  auth: SessionCheckDeps['auth'],
  policy: SessionCheckPolicy,
  halt: AbortSignal,
): Promise<SessionHolder | undefined> {
  return new Promise((resolve) => {
    const finish = (holder: SessionHolder | undefined) => {
      clearTimeout(timer);
      halt.removeEventListener('abort', gaveUp);
      resolve(holder);
    };
    const gaveUp = () => finish(undefined);
    const timer = setTimeout(gaveUp, policy.timeoutMs);
    halt.addEventListener('abort', gaveUp, { once: true });
    auth
      .getSession()
      .then(readSessionAnswer, () => undefined)
      .then(finish, gaveUp);
  });
}

/** Whether anything made on this phone has not reached the server (queued or in the outbox). */
async function holdsUnsent(outbox: ExtensionOutbox, localFirst: LocalFirstContextValue) {
  const queued = await localFirst.db.getOptional(
    "SELECT 1 FROM commands WHERE status != 'done' LIMIT 1",
  );
  if (queued !== null) return true;
  try {
    const pending = readPendingActions(outbox.read());
    return pending.kind === 'unsupported' || pending.actions.length > 0;
  } catch {
    return true;
  }
}

/**
 * Asks the server whose session a returning install holds, until it gets an answer. Still `uid`:
 * nothing changes. Someone else, or no one: this phone stops being `uid` (the sign-out hooks wipe
 * its data, queue and outbox, as for `SESSION_REVOKED`) and the app restarts on the session in
 * storage; with no session left, the restart is a first launch and creates the anonymous one.
 * Only the server's own answer wipes anything: a check that fails, times out or gets an error
 * page keeps the phone on its local data and asks again later. No session while changes made
 * here are still unsent never wipes either: sync and uploads stop until a start finds a session. The check never creates a
 * session, so nothing is ever sent for a new uid from the old uid's database.
 */
export async function confirmStillUid(
  deps: SessionCheckDeps,
  uid: string,
  localFirst: LocalFirstContextValue,
  halt: AbortSignal,
) {
  const policy = deps.sessionCheck ?? SESSION_CHECK;
  let failures = 0;
  let holder: SessionHolder | undefined;
  while (!halt.aborted) {
    holder = await askWhoseSession(deps.auth, policy, halt);
    if (holder !== undefined || halt.aborted) break;
    failures += 1;
    await pause(backoffDelayMs(failures, policy.backoff), halt);
  }
  if (halt.aborted || holder === undefined || holder?.userId === uid) return;
  if (holder === null && (await holdsUnsent(deps.outbox, localFirst))) {
    if (halt.aborted) return;
    // No session, but this phone made things the server never got: a wipe would lose them for
    // good. Everything stays as it is, without sync or uploads; the next start asks again.
    await stopSyncing(localFirst.db);
    await localFirst.queue.stop();
    deps.onError(new Error('no session, but unsent changes on this phone: local data kept'));
    return;
  }
  try {
    await runOnSignOutHooks();
    if (holder !== null) deps.lastUid.write(holder.userId);
  } catch (error) {
    deps.onError(error);
  }
  deps.restart();
}
