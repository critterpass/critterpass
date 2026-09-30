import { useLocalSearchParams } from 'expo-router';

import { DetailScreen } from '@/features/critters/detail/detail-screen';
import { LocalFirstGate } from '@/features/critters/local-first-gate';

/** A critter's detail (3l-3). */
export default function CritterDetailRoute() {
  const { critterId } = useLocalSearchParams<{ critterId: string }>();
  return (
    <LocalFirstGate>
      <DetailScreen critterId={typeof critterId === 'string' ? critterId : ''} />
    </LocalFirstGate>
  );
}
