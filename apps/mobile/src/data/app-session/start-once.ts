/**
 * One app-session start shared by every caller (the root, push registration, link claims, the
 * screens that need the uid). A start in flight is shared, a started session is kept for the
 * process, and after a failure every caller gets that failure back until a cooldown has passed, so
 * a dozen callers retrying at once never become a dozen sign-ins against a server that is already
 * refusing them. The cooldown grows with each failure in a row and resets on success.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a developer-facing error, never copy. */
export const START_COOLDOWN_MS = [1_500, 4_000, 12_000, 50_000] as const;

export function startOnce<T>(
  start: () => Promise<T>,
  now: () => number = Date.now,
): () => Promise<T> {
  let starting: Promise<T> | null = null;
  let failures = 0;
  let retryAt = 0;
  let lastError = new Error('the app session has not started');
  return () => {
    if (starting === null && now() < retryAt) return Promise.reject(lastError);
    starting ??= start().then(
      (started) => {
        failures = 0;
        return started;
      },
      (error: unknown) => {
        starting = null;
        lastError = error instanceof Error ? error : new Error(String(error));
        const cooldown = START_COOLDOWN_MS[Math.min(failures, START_COOLDOWN_MS.length - 1)];
        retryAt = now() + (cooldown ?? 0);
        failures += 1;
        throw error;
      },
    );
    return starting;
  };
}
