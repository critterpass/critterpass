import { useLocalSearchParams } from 'expo-router';

import { PremiumWhereScreen } from '@/features/critters/premium/where/where-screen';

function useFormId(): string {
  const { formId } = useLocalSearchParams<{ formId: string }>();
  return typeof formId === 'string' ? formId : '';
}

/** Where, when and how to meet one form. */
export default function WhereRoute() {
  return <PremiumWhereScreen formId={useFormId()} />;
}
