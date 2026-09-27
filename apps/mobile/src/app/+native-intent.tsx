import { routeIncomingUrl } from '@/lib/links/router';

/**
 * expo-router's hook for URLs the OS hands the app (Universal Links, App Links, `critterpass://`
 * from notifications, widgets and extensions): rewrites each to the in-app route it should open.
 * Any failure falls back to Home rather than leaving the app on a broken route.
 */
export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  try {
    return await routeIncomingUrl(path);
  } catch {
    return '/';
  }
}
