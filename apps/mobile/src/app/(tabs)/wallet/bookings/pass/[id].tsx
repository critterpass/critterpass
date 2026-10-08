import { Redirect, useLocalSearchParams } from 'expo-router';

import { boardingPassRoute } from '@/features/bookings/routes';

/** The path links from the server still name: it opens the pass where it lives now. */
export default function BoardingPassLinkRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={boardingPassRoute(id)} />;
}
