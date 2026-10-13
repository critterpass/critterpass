import { useLocalSearchParams } from 'expo-router';

import { InvitePremium } from '@/features/drivers/premium/InvitePremium';

/** Invite a driver to be listed (6g-2): `/{tripId}/drivers/ours/invite/{providerId}`. */
export default function InviteDriverRoute() {
  const { tripId, providerId } = useLocalSearchParams<{ tripId: string; providerId: string }>();
  const props = { tripId: tripId ?? '', providerId: providerId ?? '' };
  return <InvitePremium {...props} />;
}
