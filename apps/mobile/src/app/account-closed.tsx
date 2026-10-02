import { getAlarmPort } from '../../modules/cp-alarm';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { RestoreScreen } from '@/features/you/account/restore-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

provideAlarmCanceller(getAlarmPort());

/** Signed back in to a closed account: restore it or leave it closed. */
export default function AccountClosedRoute() {
  return (
    <LocalFirstGate>
      <RestoreScreen />
    </LocalFirstGate>
  );
}
