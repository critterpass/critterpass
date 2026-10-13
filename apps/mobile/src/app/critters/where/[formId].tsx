import { useLocalSearchParams } from 'expo-router';

import { PremiumWhereScreen } from '@/features/critters/premium/where/where-screen';
import { WhereScreen } from '@/features/critters/where/where-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useFormId(): string {
  const { formId } = useLocalSearchParams<{ formId: string }>();
  return typeof formId === 'string' ? formId : '';
}

function CurrentWhereRoute() {
  return <WhereScreen formId={useFormId()} />;
}

function PremiumWhereRoute() {
  return <PremiumWhereScreen formId={useFormId()} />;
}

/** Where, when and how to meet one form. */
export default premiumRoute({ premium: PremiumWhereRoute, legacy: CurrentWhereRoute });
