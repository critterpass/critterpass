import { useLocalSearchParams } from 'expo-router';

import { BoardingPassPremium } from '@/features/bookings/premium/BoardingPassPremium';

/** The premium UI's boarding pass (7.11): a native full-screen modal over the wallet. */
function PassOverWallet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BoardingPassPremium bookingId={id} />;
}

export default PassOverWallet;
