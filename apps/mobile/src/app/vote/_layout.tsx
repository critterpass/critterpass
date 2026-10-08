import { Stack } from 'expo-router/js-stack';

import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { modalGroupOptions } from '@/lib/navigation/transitions';
import { SessionGate } from '@/ui/states/SessionGate';

/** The vote area: the new-poll and pitch sheets, the showdown and the winner reveal. */
export default function VoteLayout() {
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <SessionGate>
        <Stack screenOptions={modalGroupOptions()} />
      </SessionGate>
    </VoteServicesProvider>
  );
}
