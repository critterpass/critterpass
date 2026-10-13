import { useLocalSearchParams } from 'expo-router';

import { AskForMeScreen } from '@/features/drivers/ask/AskForMeScreen';
import { AskForMePremium } from '@/features/drivers/premium/AskForMePremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Tokek's post for the groups (6b-1): `/{tripId}/drivers/ask?days=`. */
export default function AskForMeRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const premium = usePremiumUi();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return premium ? <AskForMePremium {...props} /> : <AskForMeScreen {...props} />;
}
