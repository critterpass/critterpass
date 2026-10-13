import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/** Places: the guest guide's place page is a pushed page; the search sheet rises over its opener. */
export default function PlacesLayout() {
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <SessionGate>
        <PremiumStack navigator="places" />
      </SessionGate>
    </VoteServicesProvider>
  );
}
