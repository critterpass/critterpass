import { useLocalSearchParams } from 'expo-router';

import { DirectoryScreen } from '@/features/drivers/directory/DirectoryScreen';
import { DirectoryPremium } from '@/features/drivers/premium/DirectoryPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Drivers our crews used (6e-1, 6e-3, 6.25): `/{tripId}/drivers/directory?area=`. */
export default function DriverDirectoryRoute() {
  const { tripId, area } = useLocalSearchParams<{ tripId: string; area?: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', area: area ?? null };
  return premium ? <DirectoryPremium {...props} /> : <DirectoryScreen {...props} />;
}
