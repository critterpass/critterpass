import { Stack } from 'expo-router/js-stack';

import { deviceVoteServices } from '@/features/vote/data/device-vote-services';
import { VoteServicesProvider } from '@/features/vote/data/vote-services';
import { modalGroupOptions } from '@/lib/navigation/transitions';

/** Places: the search sheet and the guest guide's place page. */
export default function PlacesLayout() {
  return (
    <VoteServicesProvider services={deviceVoteServices}>
      <Stack screenOptions={modalGroupOptions()} />
    </VoteServicesProvider>
  );
}
