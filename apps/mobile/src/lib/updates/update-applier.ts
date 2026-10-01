/**
 * When a downloaded update may restart the app on its own. expo-updates downloads an update during
 * a launch and applies it on the next cold start; on builds that carry Developer tools a fix
 * should not need "open, swipe away, open again", so the app restarts itself at a moment that
 * costs the person nothing:
 *
 * - when the app comes back to the front after having been in the background, or
 * - right after launch, when the download finished within the first seconds and the person has
 *   not gone anywhere yet.
 *
 * Never while they are busy (a sheet up, typing), and once per update: the id is written down
 * before the restart, so an update that fails to start can never restart the app in a loop.
 */

/** How long after the JS started a finished download still counts as "right after launch". */
export const LAUNCH_WINDOW_MS = 8000;

export interface UpdateApplierDeps {
  /** False on production builds: nothing ever restarts there. */
  readonly available: boolean;
  readonly isBusy: () => boolean;
  /** The update id the app last restarted itself for. */
  readonly reloadedFor: { read(): string | null; write(updateId: string): void };
  readonly reload: () => Promise<void>;
  readonly now: () => number;
  /** When this JS runtime started. */
  readonly startedAt: number;
}

export interface UpdateApplier {
  /** The downloaded update waiting to be applied changed (`null`: none). True when it restarts. */
  downloaded(updateId: string | null): boolean;
  /** The app is in front again after having been in the background. True when it restarts. */
  returnedToForeground(): boolean;
  /** The person went to another screen: the launch moment has passed. */
  moved(): void;
}

export function createUpdateApplier(deps: UpdateApplierDeps): UpdateApplier {
  let pending: string | null = null;
  let hasMoved = false;

  const apply = (moment: 'launch' | 'foreground'): boolean => {
    if (!deps.available || pending === null) return false;
    if (deps.reloadedFor.read() === pending) return false;
    if (deps.isBusy()) return false;
    if (moment === 'launch' && (hasMoved || deps.now() - deps.startedAt > LAUNCH_WINDOW_MS)) {
      return false;
    }
    deps.reloadedFor.write(pending);
    // A restart that fails leaves the update for the next cold start, as without this.
    void deps.reload().catch(() => undefined);
    return true;
  };

  return {
    downloaded(updateId) {
      pending = updateId;
      return apply('launch');
    },
    returnedToForeground: () => apply('foreground'),
    moved() {
      hasMoved = true;
    },
  };
}
