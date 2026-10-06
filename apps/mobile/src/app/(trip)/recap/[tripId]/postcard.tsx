import { useLocalSearchParams } from 'expo-router';

import { PostcardScreen } from '@/features/album/postcard/postcard-screen';

/** The postcard composer (3m-9), the recap's last card. */
export default function RecapPostcardRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <PostcardScreen tripId={tripId} />
  ) : null;
}
