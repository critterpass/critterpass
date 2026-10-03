import { useLocalSearchParams } from 'expo-router';

import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { WhereScreen } from '@/features/critters/where/where-screen';

/** Where, when and how to meet one form. */
export default function CritterWhereRoute() {
  const { formId } = useLocalSearchParams<{ formId: string }>();
  return (
    <LocalFirstGate>
      <WhereScreen formId={typeof formId === 'string' ? formId : ''} />
    </LocalFirstGate>
  );
}
