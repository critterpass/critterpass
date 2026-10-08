import { useLocalSearchParams } from 'expo-router';

import { AlbumMissing } from '@/features/album/grid/album-missing';
import { ViewerScreen } from '@/features/album/viewer/viewer-screen';

/** One album photo full screen. */
export default function AlbumPhotoRoute() {
  const { tripId, photoId } = useLocalSearchParams<{ tripId: string; photoId: string }>();
  return typeof tripId === 'string' &&
    tripId.length > 0 &&
    typeof photoId === 'string' &&
    photoId.length > 0 ? (
    <ViewerScreen tripId={tripId} photoId={photoId} />
  ) : (
    <AlbumMissing testID="album-photo-missing" />
  );
}
