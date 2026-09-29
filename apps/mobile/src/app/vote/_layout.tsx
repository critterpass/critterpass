import { Stack } from 'expo-router/js-stack';

import { modalGroupOptions } from '@/lib/navigation/transitions';

/** The vote area: the new-poll and pitch sheets, the showdown and the winner reveal. */
export default function VoteLayout() {
  return <Stack screenOptions={modalGroupOptions()} />;
}
