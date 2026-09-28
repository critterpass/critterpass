/**
 * Keeps the app icon's badge equal to the needs-you count (3b-2: the icon badge mirrors the bell).
 * Set only once the count is known, so a cold start never flashes the badge to zero.
 */
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

export function useAppBadge(count: number, known: boolean): void {
  useEffect(() => {
    if (!known) return;
    Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => undefined);
  }, [count, known]);
}
