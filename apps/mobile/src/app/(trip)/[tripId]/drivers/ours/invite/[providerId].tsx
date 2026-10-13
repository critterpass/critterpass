import { useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/features/drivers/invite/InviteScreen';
import { InvitePremium } from '@/features/drivers/premium/InvitePremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Invite a driver to be listed (6g-2): `/{tripId}/drivers/ours/invite/{providerId}`. */
export default function InviteDriverRoute() {
  const { tripId, providerId } = useLocalSearchParams<{ tripId: string; providerId: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', providerId: providerId ?? '' };
  return premium ? <InvitePremium {...props} /> : <InviteScreen {...props} />;
}
