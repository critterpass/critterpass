import { getAlarmPort } from '../../modules/cp-alarm';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { LocalFirstGate } from '@/features/you/local-first-gate';
import { RestorePremiumScreen } from '@/features/you/premium/closed/restore-premium-screen';

provideAlarmCanceller(getAlarmPort());

/** Signed back in to a closed account: restore it or leave it closed. */
export default function AccountClosedRoute() {
  return (
    <LocalFirstGate>
      <RestorePremiumScreen />
    </LocalFirstGate>
  );
}
