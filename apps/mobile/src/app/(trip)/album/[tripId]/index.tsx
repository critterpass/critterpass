import { useLocalSearchParams } from 'expo-router';

import { PremiumRouteMissing } from '@/features/album';
import { AlbumScreen } from '@/features/album/grid/album-screen';
import { PremiumJournalScene } from '@/features/album/premium/journal-scene';
import { PremiumUploadBanner } from '@/features/album/premium/upload-banner';
import { PremiumWhoSheet } from '@/features/album/premium/who-sheet';

/** The crew's album (3m-2), drawn as the trip journal. */
export default function AlbumRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <AlbumScreen
      tripId={tripId}
      View={PremiumJournalScene}
      Banner={PremiumUploadBanner}
      Who={PremiumWhoSheet}
    />
  ) : (
    <PremiumRouteMissing testID="album-missing" />
  );
}
