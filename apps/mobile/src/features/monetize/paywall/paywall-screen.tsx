/** The paywall (4e-1) on the current UI: the shared paywall state in a rising modal. */
import { RiseModal } from '@/ui/sheet/RiseModal';

import { PaywallView } from './paywall-view';
import { usePaywallScreen } from './use-paywall-screen';

export function PaywallScreen() {
  const { props, dismiss } = usePaywallScreen();
  return (
    <RiseModal closeSide="start" onDismiss={dismiss} testID="paywall-rise">
      <PaywallView {...props} />
    </RiseModal>
  );
}
