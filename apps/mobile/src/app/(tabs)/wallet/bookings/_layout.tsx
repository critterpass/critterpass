/* eslint-disable lingui/no-unlocalized-strings -- route names, not copy. */
import { useMemo } from 'react';

import { BookingsServicesProvider } from '@/features/bookings/data/services';
import { deviceBookingsServices } from '@/features/bookings/data/device-services';
import { tabSheetOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

import { getOcr } from '../../../../../modules/cp-ocr';

/** A booking opened cold from a link keeps the stack under it, so back lands on Bookings. */
export const unstable_settings = { initialRouteName: 'index' };

/**
 * The BOOKINGS half of the Wallet tab on the native stack: a booking, adding one and the archive
 * push inside the tab; the `+` sheet, paste, the link code and the mailbox are native form sheets,
 * and the boarding pass is a tall native sheet with its ✕ that swipes down.
 */
export default function BookingsLayout() {
  const services = useMemo(() => deviceBookingsServices(getOcr()), []);
  return (
    <BookingsServicesProvider services={services}>
      <PremiumStack>
        <PremiumStackScreen
          name="add-sheet"
          options={tabSheetOptions('wallet/bookings/add-sheet')}
        />
        <PremiumStackScreen name="paste" options={tabSheetOptions('wallet/bookings/paste')} />
        <PremiumStackScreen
          name="link-code"
          options={tabSheetOptions('wallet/bookings/link-code')}
        />
        <PremiumStackScreen name="mailbox" options={tabSheetOptions('wallet/bookings/mailbox')} />
        <PremiumStackScreen
          name="pass/[id]"
          options={tabSheetOptions('wallet/bookings/pass/[id]')}
        />
      </PremiumStack>
    </BookingsServicesProvider>
  );
}
