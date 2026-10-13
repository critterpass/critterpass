import { useLocalSearchParams } from 'expo-router';

import { DirectoryPremium } from '@/features/drivers/premium/DirectoryPremium';

/** Drivers our crews used (6e-1, 6e-3, 6.25): `/{tripId}/drivers/directory?area=`. */
export default function DriverDirectoryRoute() {
  const { tripId, area } = useLocalSearchParams<{ tripId: string; area?: string }>();
  const props = { tripId: tripId ?? '', area: area ?? null };
  return <DirectoryPremium {...props} />;
}
