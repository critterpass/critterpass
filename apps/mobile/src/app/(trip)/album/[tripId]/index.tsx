import { useLocalSearchParams } from 'expo-router';

import { AlbumScreen } from '@/features/album/grid/album-screen';

/** The crew's album (3m-2). */
export default function AlbumRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? <AlbumScreen tripId={tripId} /> : null;
}
