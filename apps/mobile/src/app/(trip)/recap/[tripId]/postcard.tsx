import { useLocalSearchParams } from 'expo-router';

import { OpenedPostcardScreen } from '@/features/album/postcard/opened-postcard-screen';

/** The postcard composer (3m-9), the recap's last card; an inbox item opens it on one postcard. */
export default function RecapPostcardRoute() {
  const { tripId, postcard_id: postcardId } = useLocalSearchParams<{
    tripId: string;
    postcard_id?: string;
  }>();
  return typeof tripId === 'string' && tripId.length > 0 ? (
    <OpenedPostcardScreen
      tripId={tripId}
      postcardId={typeof postcardId === 'string' ? postcardId : null}
    />
  ) : null;
}
