import { useLocalSearchParams } from 'expo-router';

import { WhereScreen } from '@/features/critters/where/where-screen';

/** Where, when and how to meet one form. */
export default function CritterWhereRoute() {
  const { formId } = useLocalSearchParams<{ formId: string }>();
  return <WhereScreen formId={typeof formId === 'string' ? formId : ''} />;
}
