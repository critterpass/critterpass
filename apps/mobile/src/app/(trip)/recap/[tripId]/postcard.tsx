import { useLocalSearchParams } from 'expo-router';

import { OpenedPostcardScreen } from '@/features/album/postcard/opened-postcard-screen';
import { RouteMissing } from '@/features/recap/route-missing';

/** The postcard composer (3m-9), the recap's last card; an inbox item opens it on one postcard. */
export default function RecapPostcardRoute() {
  const { tripId, postcard_id: postcardId } = useLocalSearchParams<{
    tripId: string;
    postcard_id?: string;
  }>();
  // A link that names no trip still lands on a page with a way out.
  if (typeof tripId !== 'string' || tripId.length === 0) {
    return <RouteMissing testID="recap-postcard-missing" />;
  }
  return (
    <OpenedPostcardScreen
      tripId={tripId}
      postcardId={typeof postcardId === 'string' ? postcardId : null}
    />
  );
}
