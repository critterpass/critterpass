import { StorageSettingsScreen } from '@/features/trip/bundle/storage-settings';
import { OfflineStoragePremiumScreen } from '@/features/you/premium/offline/offline-storage-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** Settings > Offline (3n-2; premium 9.05): the trips saved on this phone and auto-download. */
export default premiumRoute({
  premium: OfflineStoragePremiumScreen,
  legacy: StorageSettingsScreen,
});
