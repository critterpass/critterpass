import { useLocalSearchParams } from 'expo-router';

import { DetailScreen } from '@/features/critters/detail/detail-screen';

/** A critter's detail (3l-3). */
export default function CritterDetailRoute() {
  const { critterId } = useLocalSearchParams<{ critterId: string }>();
  return <DetailScreen critterId={typeof critterId === 'string' ? critterId : ''} />;
}
