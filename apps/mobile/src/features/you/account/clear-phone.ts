/**
 * Letting go of the account on this phone, after a sign-out or after the account was closed: the
 * same routine Developer tools' "Start fresh" runs (`startFresh` lists every store an account
 * leaves behind), ending with a restart at the welcome screen. The device wiring is passed in by
 * the screens, so this stays testable.
 */
/* eslint-disable lingui/no-unlocalized-strings -- result kinds, wire values and test ids, never copy. */
import {
  startFresh,
  type StartFreshPorts,
  type StartFreshResult,
} from '@/lib/dev-tools/start-fresh';

export type PhonePorts = Omit<StartFreshPorts, 'eraseAccount'>;

export type ClearReason =
  /** The account stays on the server: sign out there, then clear the phone. */
  | 'sign_out'
  /** The server already closed the account and ended its sessions: no call is made on them. */
  | 'account_closed';

export type ClearResult =
  | { readonly kind: 'restarting' }
  /** Some of the phone could not be cleared; safe to run again. */
  | { readonly kind: 'incomplete' }
  /** Cleared, but the app would not restart by itself. */
  | { readonly kind: 'restart_failed' };

function resultOf(result: StartFreshResult): ClearResult {
  if (result.kind === 'restarting') return { kind: 'restarting' };
  if (result.kind === 'restart_failed') return { kind: 'restart_failed' };
  return { kind: 'incomplete' };
}

export interface ClearOptions {
  /** Runs after everything is cleared, right before the restart. */
  readonly beforeRestart?: () => void;
}

export async function clearThisPhone(
  ports: PhonePorts,
  reason: ClearReason,
  options: ClearOptions = {},
): Promise<ClearResult> {
  const result = await startFresh(
    {
      ...ports,
      reload: async () => {
        options.beforeRestart?.();
        await ports.reload();
      },
      eraseAccount: () => Promise.resolve(reason === 'account_closed' ? 'erased' : 'unavailable'),
    },
    { leaveAccountOnServer: true },
  );
  return resultOf(result);
}
