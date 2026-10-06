import { useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/features/drivers/invite/InviteScreen';

/** Invite a driver to be listed (6g-2): `/{tripId}/drivers/ours/invite/{providerId}`. */
export default function InviteDriverRoute() {
  const { tripId, providerId } = useLocalSearchParams<{ tripId: string; providerId: string }>();
  return <InviteScreen tripId={tripId ?? ''} providerId={providerId ?? ''} />;
}
