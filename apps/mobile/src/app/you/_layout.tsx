import { getAlarmPort } from '../../../modules/cp-alarm';

import { provideAlarmCanceller } from '@/features/you/account/device-wipe';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { SessionGate } from '@/ui/premium/shell/session-gate';

// Signing out and deleting the account end in a cleared phone, leave-by alarms included.
provideAlarmCanceller(getAlarmPort());

const APPEARANCE_SHEET = sheetRouteOptions('half');
const FORM_SHEET = sheetRouteOptions('full');

/**
 * The profile's settings, pushed over the tabs on a native stack; session-only. Appearance shows
 * as a half-height sheet and the past-trip form as a full-height one.
 */
export default function YouLayout() {
  return (
    <SessionGate>
      <PremiumStack>
        <PremiumStackScreen name="appearance" options={APPEARANCE_SHEET} />
        <PremiumStackScreen name="past-trip" options={FORM_SHEET} />
      </PremiumStack>
    </SessionGate>
  );
}
