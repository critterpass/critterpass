import { Redirect, useLocalSearchParams } from 'expo-router';

import { BoardingPassPremium } from '@/features/bookings/premium/BoardingPassPremium';
import { modalBoardingPassRoute } from '@/features/bookings/routes';
import { premiumRoute } from '@/lib/premium-ui';

/** The premium UI's boarding pass (7.11): a native full-screen modal over the wallet. */
function PassOverWallet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BoardingPassPremium bookingId={id} />;
}

/** The path links from the server still name: the current UI opens the pass where it lives. */
function PassLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={modalBoardingPassRoute(id)} />;
}

export default premiumRoute({ premium: PassOverWallet, legacy: PassLink });
