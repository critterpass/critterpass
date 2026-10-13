import { useMemo } from 'react';

import { deviceMoneyServices } from '@/features/money/data/device-services';
import { MoneyServicesProvider } from '@/features/money/data/services';
import { registerMoneyScreens } from '@/features/money/routes';
import { SessionGate } from '@/ui/premium/shell/session-gate';
import { PremiumStack } from '@/ui/premium/shell';

import { getOcr } from '../../../modules/cp-ocr';

registerMoneyScreens();

/**
 * Money's pushed screens (over the tabs): add, scan, settle up, history and the details, on the
 * native stack, so its pages get the native header and edge swipe.
 */
export default function MoneyLayout() {
  const services = useMemo(() => deviceMoneyServices(getOcr()), []);
  return (
    <MoneyServicesProvider services={services}>
      <SessionGate>
        <PremiumStack navigator="money" />
      </SessionGate>
    </MoneyServicesProvider>
  );
}
