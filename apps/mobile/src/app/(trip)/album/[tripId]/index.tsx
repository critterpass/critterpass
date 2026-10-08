import { useLocalSearchParams } from 'expo-router';

import { AlbumMissing } from '@/features/album/grid/album-missing';
import { AlbumScreen } from '@/features/album/grid/album-screen';

/** The crew's album (3m-2). */
export default function AlbumRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <AlbumScreen tripId={tripId} />
  ) : (
    <AlbumMissing testID="album-missing" />
  );
}
