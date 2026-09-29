import { Stack } from 'expo-router/js-stack';

import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { modalGroupOptions } from '@/lib/navigation/transitions';

/** The vote area: the new-poll and pitch sheets, the showdown and the winner reveal. */
export default function VoteLayout() {
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <Stack screenOptions={modalGroupOptions()} />
    </VoteServicesProvider>
  );
}
