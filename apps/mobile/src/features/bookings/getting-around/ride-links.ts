/** Opens a ride app with the trip filled in, or its web/store page when the app isn't there. */
import type { RideLink } from '@cp/domain';
import { Linking } from 'react-native';

export function openRideLink(link: RideLink): void {
  void Linking.openURL(link.app_url).catch(() =>
    Linking.openURL(link.fallback_url).catch(() => undefined),
  );
}
