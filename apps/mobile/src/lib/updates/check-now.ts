/**
 * "Check for update now" (Developer tools): asks the update server, downloads what it has and
 * restarts into it, reporting each step so the row can show where it is.
 */
export type CheckNowStep = 'checking' | 'downloading' | 'restarting';

export type CheckNowOutcome =
  | { readonly kind: 'restarting' }
  | { readonly kind: 'up_to_date' }
  | { readonly kind: 'failed'; readonly message: string };

export interface CheckNowDeps {
  readonly check: () => Promise<{ readonly isAvailable: boolean }>;
  readonly fetch: () => Promise<{ readonly isNew: boolean }>;
  readonly reload: () => Promise<void>;
}

export async function checkForUpdateNow(
  deps: CheckNowDeps,
  onStep: (step: CheckNowStep) => void,
): Promise<CheckNowOutcome> {
  try {
    onStep('checking');
    if (!(await deps.check()).isAvailable) return { kind: 'up_to_date' };
    onStep('downloading');
    if (!(await deps.fetch()).isNew) return { kind: 'up_to_date' };
    onStep('restarting');
    await deps.reload();
    return { kind: 'restarting' };
  } catch (error) {
    return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}
