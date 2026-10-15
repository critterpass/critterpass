/**
 * The ways to add a booking, for the premium wallet and its `+` sheet: forward (copies the crew's
 * address, or says why there is none yet), scan a ticket, paste a link or code, connect a mailbox,
 * or type it by hand.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useToast } from '@/ui/premium';

import { useBookingsServices } from '../data/services';
import type { WalletContext } from '../data/use-wallet-context';
import { addByHandRoute, BOOKINGS_ROUTES } from '../routes';
import { useBookingScan } from '../scan/use-booking-scan';

export function useAddChannels(context: WalletContext) {
  const { t } = useLingui();
  const services = useBookingsServices();
  const scan = useBookingScan(services.ocr, context.trip?.id ?? null);
  // The nearest toast host: inside the + sheet the sheet's own, so the toast shows over the sheet.
  const toast = useToast();
  const forward = () => {
    if (context.inboundAddress !== null) {
      void services.copy(context.inboundAddress).then(() =>
        toast.show({
          kind: 'done',
          message: t({
            id: 'bookings.add.copiedToast',
            message: 'Forward any confirmation to that address.',
          }),
        }),
      );
      return;
    }
    toast.show({
      kind: 'error',
      message:
        context.status === 'no_trip'
          ? t({
              id: 'bookings.add.noTrip',
              message: 'Bookings land in a trip. Start one with the crew and they show up here.',
            })
          : t({
              id: 'bookings.add.noAddressToast',
              message: 'The crew’s address isn’t on this phone yet. Scan or paste for now.',
            }),
    });
  };
  return {
    address: context.inboundAddress,
    scanState: scan.state,
    forward,
    scan: () => void scan.scan(),
    paste: () => router.push(BOOKINGS_ROUTES.paste),
    mailbox: () => router.push(BOOKINGS_ROUTES.mailbox),
    byHand: () => router.push(addByHandRoute()),
  };
}
