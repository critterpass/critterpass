import { getAlarmPort } from '../../modules/cp-alarm';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { RestoreScreen } from '@/features/you/account/restore-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';
import { RestorePremiumScreen } from '@/features/you/premium/closed/restore-premium-screen';
import { premiumRoute } from '@/lib/premium-ui';

provideAlarmCanceller(getAlarmPort());

const Restore = premiumRoute({ premium: RestorePremiumScreen, legacy: RestoreScreen });

/** Signed back in to a closed account: restore it or leave it closed. */
export default function AccountClosedRoute() {
  return (
    <LocalFirstGate>
      <Restore />
    </LocalFirstGate>
  );
}
