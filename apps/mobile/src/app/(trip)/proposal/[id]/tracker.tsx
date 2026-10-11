import { useLocalSearchParams } from 'expo-router';

import { TrackerScreen } from '@/features/proposal';
import { PremiumTrackerView } from '@/features/proposal/premium/tracker-view';
import { usePremiumUi } from '@/lib/premium-ui';

/** The organiser's RSVP tracker (`/proposal/{id}/tracker`; 4.51 in the premium look). */
export default function ProposalTrackerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const premium = usePremiumUi();
  return <TrackerScreen proposalId={id} {...(premium ? { View: PremiumTrackerView } : {})} />;
}
