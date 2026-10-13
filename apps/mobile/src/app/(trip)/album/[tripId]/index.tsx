import { useLocalSearchParams } from 'expo-router';

import { AlbumMissing } from '@/features/album/grid/album-missing';
import { AlbumScreen } from '@/features/album/grid/album-screen';
import { PremiumJournalScene } from '@/features/album/premium/journal-scene';
import { PremiumUploadBanner } from '@/features/album/premium/upload-banner';

/** The crew's album (3m-2), drawn as the trip journal. */
export default function AlbumRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <AlbumScreen tripId={tripId} View={PremiumJournalScene} Banner={PremiumUploadBanner} />
  ) : (
    <AlbumMissing testID="album-missing" />
  );
}
