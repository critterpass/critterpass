/* eslint-disable lingui/no-unlocalized-strings -- route names, not copy. */
import { useMemo } from 'react';

import { registerBookingsScreens } from '@/features/bookings/routes';
import { WALLET_HALF_OPTIONS } from '@/features/bookings/stack/wallet-halves';
import { deviceMoneyServices } from '@/features/money/data/device-services';
import { MoneyServicesProvider } from '@/features/money/data/services';
import { registerMoneyScreens } from '@/features/money/routes';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';
import { tabSheetOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

import { getOcr } from '../../../../modules/cp-ocr';

registerMoneyScreens();
registerBookingsScreens();

export const unstable_settings = { initialRouteName: 'money/index' };

/**
 * The WALLET tab: BOOKINGS | MONEY. Money's Balances opens first and the switch swaps the halves in
 * place; Budget pushes inside the tab (the tab bar hides, as on every push), the trip and currency pickers are
 * native sheets. The bookings half registers its own screens under `bookings/`.
 */
export default function WalletLayout() {
  const services = useMemo(() => deviceMoneyServices(getOcr()), []);
  // The tab bar mounts this tab at launch, before the local database is open; the halves read it as
  // they render, so they wait for it here.
  return (
    <LocalFirstGate>
      <MoneyServicesProvider services={services}>
        <PremiumStack>
          <PremiumStackScreen name="money/index" options={WALLET_HALF_OPTIONS} />
          <PremiumStackScreen name="bookings" options={WALLET_HALF_OPTIONS} />
          <PremiumStackScreen
            name="money/currency"
            options={tabSheetOptions('wallet/money/currency')}
          />
          <PremiumStackScreen name="money/trip" options={tabSheetOptions('wallet/money/trip')} />
        </PremiumStack>
      </MoneyServicesProvider>
    </LocalFirstGate>
  );
}
