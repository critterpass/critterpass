import { useLocalSearchParams } from 'expo-router';

import { PremiumRouteMissing } from '@/features/album';
import { PREMIUM_VIEWER_LOOK } from '@/features/album/premium/photo-viewer';
import { ViewerScreen } from '@/features/album/viewer/viewer-screen';

/** One album photo full screen. */
export default function AlbumPhotoRoute() {
  const { tripId, photoId } = useLocalSearchParams<{ tripId: string; photoId: string }>();
  return typeof tripId === 'string' &&
    tripId.length > 0 &&
    typeof photoId === 'string' &&
    photoId.length > 0 ? (
    <ViewerScreen tripId={tripId} photoId={photoId} look={PREMIUM_VIEWER_LOOK} />
  ) : (
    <PremiumRouteMissing testID="album-photo-missing" />
  );
}
