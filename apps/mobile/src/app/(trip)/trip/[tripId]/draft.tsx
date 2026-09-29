import { Redirect, useLocalSearchParams } from 'expo-router';

import { draftRoutes } from '@/features/plan/draft';

/** Pushes link the draft as `/trip/{id}/draft` (draft ready); the screen lives at `/{id}/draft`. */
export default function DraftLinkForward() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Redirect href={draftRoutes.review(tripId)} />;
}
