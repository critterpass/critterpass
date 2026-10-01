import { useLocalSearchParams } from 'expo-router';

import { SetScreen } from '@/features/critters/dex/set-screen';
import { LocalFirstGate } from '@/features/critters/local-first-gate';

/** One place set (3l-8). */
export default function CritterSetRoute() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return (
    <LocalFirstGate>
      <SetScreen setId={typeof setId === 'string' ? setId : ''} />
    </LocalFirstGate>
  );
}
