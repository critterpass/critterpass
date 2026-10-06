import { useLocalSearchParams } from 'expo-router';

import { ViewerScreen } from '@/features/album/viewer/viewer-screen';

/** One album photo full screen. */
export default function AlbumPhotoRoute() {
  const { tripId, photoId } = useLocalSearchParams<{ tripId: string; photoId: string }>();
  return typeof tripId === 'string' && typeof photoId === 'string' ? (
    <ViewerScreen tripId={tripId} photoId={photoId} />
  ) : null;
}
