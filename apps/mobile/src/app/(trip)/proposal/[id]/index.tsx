import { useLocalSearchParams } from 'expo-router';

import { YourVersionScreen } from '@/features/proposal';

/** A proposal (`/proposal/{id}`, `?as=` for the organiser's preview of someone's version). */
export default function ProposalRoute() {
  const { id, as } = useLocalSearchParams<{ id: string; as?: string }>();
  return <YourVersionScreen proposalId={id} {...(as ? { as } : {})} />;
}
