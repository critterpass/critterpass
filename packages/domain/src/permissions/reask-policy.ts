/**
 * When a primer may be shown. A declined primer comes back at most once per trigger per window
 * (7 days unless server config says otherwise); once the OS says denied, only the Settings path is
 * offered, because asking again would show nothing. A tap the user started themselves (the camera
 * button, a Settings row) always gets an answer.
 */
import type { PermissionStatus } from './status';

export const DEFAULT_REASK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type AskDecision =
  /** Already enough for the feature; no primer. */
  | 'satisfied'
  /** Show the primer card or sheet; the OS prompt follows a toggle ON. */
  | 'primer'
  /** Declined recently for this trigger; stay quiet. */
  | 'suppressed'
  /** The OS will not prompt again: show the denied row with "Open Settings". */
  | 'settings_only'
  /** Blocked by device policy (parental controls, MDM); nothing the user can change here. */
  | 'unavailable';

export interface AskInput {
  readonly status: PermissionStatus;
  readonly canAskAgain: boolean;
  /** The feature's need is already met (e.g. `wiu` for a session, `always` for the upgrade). */
  readonly satisfied: boolean;
  /** When the user last dismissed this trigger's primer, if ever (epoch ms). */
  readonly lastDeclinedAt: number | null;
  readonly now: number;
  readonly userInitiated: boolean;
  readonly windowMs?: number;
}

export function decideAsk(input: AskInput): AskDecision {
  if (input.satisfied) return 'satisfied';
  if (input.status === 'restricted') return 'unavailable';
  if (input.status === 'denied' || !input.canAskAgain) return 'settings_only';
  if (input.userInitiated || input.lastDeclinedAt === null) return 'primer';
  const windowMs = input.windowMs ?? DEFAULT_REASK_WINDOW_MS;
  return input.now - input.lastDeclinedAt >= windowMs ? 'primer' : 'suppressed';
}
