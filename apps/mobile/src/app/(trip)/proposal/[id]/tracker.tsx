import { useLocalSearchParams } from 'expo-router';

import { TrackerScreen } from '@/features/proposal';

/** The organiser's RSVP tracker (`/proposal/{id}/tracker`). */
export default function ProposalTrackerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrackerScreen proposalId={id} />;
}
