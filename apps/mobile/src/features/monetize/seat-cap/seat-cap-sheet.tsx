/**
 * The seat-limit presenter the boost area registers: "Seven's a crowd" when a boost would open the
 * seat, and the crew area's own waitlist sheet when it would not (the trip is boosted already and
 * full at its higher cap). BOOST opens the boost sheet for the trip; "Keep it at six" waitlists
 * the invitee through the same invite.
 */
import { WaitlistSheet, type SeatLimitPresenterProps } from '@/features/crew';

import { SeatCapPremium } from '../premium/seat-cap-premium';
import { useBoostSeatCap } from './use-seat-cap';

export function SeatCapSheet(props: SeatLimitPresenterProps) {
  if (props.detail.offer !== 'boost') return <WaitlistSheet {...props} />;
  return <BoostSeatSheet {...props} />;
}

function BoostSeatSheet(props: SeatLimitPresenterProps) {
  const view = useBoostSeatCap(props);
  return <SeatCapPremium {...view} />;
}
