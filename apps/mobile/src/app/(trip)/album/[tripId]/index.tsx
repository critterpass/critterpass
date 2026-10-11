import { useLocalSearchParams } from 'expo-router';

import { AlbumMissing } from '@/features/album/grid/album-missing';
import { AlbumScreen } from '@/features/album/grid/album-screen';
import { PremiumJournalScene } from '@/features/album/premium/journal-scene';
import { premiumRoute } from '@/lib/premium-ui';

function Album({ premium }: { readonly premium: boolean }) {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <AlbumScreen tripId={tripId} {...(premium ? { View: PremiumJournalScene } : {})} />
  ) : (
    <AlbumMissing testID="album-missing" />
  );
}

function CurrentAlbumRoute() {
  return <Album premium={false} />;
}

function PremiumAlbumRoute() {
  return <Album premium />;
}

/** The crew's album (3m-2), the trip journal in the premium look. */
export default premiumRoute({ premium: PremiumAlbumRoute, legacy: CurrentAlbumRoute });
