import { useLocalSearchParams } from 'expo-router';

import { TrackerScreen } from '@/features/proposal';
import { PremiumTrackerView } from '@/features/proposal/premium/tracker-view';

/** The organiser's RSVP tracker (`/proposal/{id}/tracker`; 4.51). */
export default function ProposalTrackerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TrackerScreen proposalId={id} View={PremiumTrackerView} />;
}
