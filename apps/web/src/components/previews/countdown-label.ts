/**
 * The live countdown to an invite code's expiry. On its own because the page's script imports it:
 * whatever sits in this module ships to the browser.
 */

/** "3d 23:12:04" (days only when there are any); null once expired or without an expiry. */
export function countdownLabel(expiresAt: string | null | undefined, now: number): string | null {
  if (expiresAt === null || expiresAt === undefined) return null;
  const left = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  if (!(left > 0)) return null;
  const days = Math.floor(left / 86_400);
  const clock = [Math.floor((left % 86_400) / 3600), Math.floor((left % 3600) / 60), left % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  return days > 0 ? `${days}d ${clock}` : clock;
}
