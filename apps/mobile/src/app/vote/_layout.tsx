import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

/**
 * The vote area. The showdown is a pushed page with its way back; the new-poll and pitch sheets
 * rise over the screen that opened them, and the winner reveal appears at once (`sheet-routes.ts`).
 */
export default function VoteLayout() {
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <SessionGate>
        <PremiumStack navigator="vote" />
      </SessionGate>
    </VoteServicesProvider>
  );
}
