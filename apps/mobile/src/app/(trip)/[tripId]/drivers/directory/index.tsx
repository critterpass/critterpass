import { useLocalSearchParams } from 'expo-router';

import { DirectoryScreen } from '@/features/drivers/directory/DirectoryScreen';

/** Drivers our crews used (6e-1, 6e-3): `/{tripId}/drivers/directory?area=`. */
export default function DriverDirectoryRoute() {
  const { tripId, area } = useLocalSearchParams<{ tripId: string; area?: string }>();
  return <DirectoryScreen tripId={tripId ?? ''} area={area ?? null} />;
}
