import { useLocalSearchParams } from 'expo-router';

import { AlbumMissing } from '@/features/album/grid/album-missing';
import { PREMIUM_VIEWER_LOOK } from '@/features/album/premium/photo-viewer';
import { ViewerScreen } from '@/features/album/viewer/viewer-screen';
import { usePremiumUi } from '@/lib/premium-ui';

/** One album photo full screen. */
export default function AlbumPhotoRoute() {
  const { tripId, photoId } = useLocalSearchParams<{ tripId: string; photoId: string }>();
  const premium = usePremiumUi();
  return typeof tripId === 'string' &&
    tripId.length > 0 &&
    typeof photoId === 'string' &&
    photoId.length > 0 ? (
    <ViewerScreen
      tripId={tripId}
      photoId={photoId}
      {...(premium ? { look: PREMIUM_VIEWER_LOOK } : {})}
    />
  ) : (
    <AlbumMissing testID="album-photo-missing" />
  );
}
