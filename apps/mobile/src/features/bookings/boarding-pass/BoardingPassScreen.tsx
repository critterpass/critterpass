/**
 * The owner's pass for one booking, from the local copy the offline bundle left in
 * `local_private` (never from the network), so it opens at the gate with no signal; the screen
 * goes to full brightness while the code shows.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';

import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { currentLeg } from '../flight-card/flight-model';
import { dayDate, zoneOf } from '../format';
import { BoardingPassView } from './BoardingPassView';
import { useFullBrightness } from './use-full-brightness';

export function BoardingPassScreen({ bookingId }: { readonly bookingId: string }) {
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const locale = useLocale();
  const { t } = useLingui();
  const booking = wallet.all.find((item) => item.id === bookingId) ?? null;
  const entry = wallet.entries.get(bookingId);
  const leg = booking === null ? null : currentLeg(booking.segments);
  const tz = zoneOf(booking?.tz, context.trip?.tz);
  const title =
    leg === null
      ? (booking?.title ?? '')
      : `${leg.carrier} ${leg.flight_no} · ${leg.dep_airport} → ${leg.arr_airport}`;
  const fields = [
    {
      key: 'seat',
      label: t({ id: 'bookings.flight.seat', message: 'Seat' }),
      value: booking?.details.seat,
    },
    { key: 'gate', label: t({ id: 'bookings.flight.gate', message: 'Gate' }), value: leg?.gate },
    {
      key: 'ref',
      label: t({ id: 'bookings.card.ref', message: 'Ref' }),
      value: booking?.supplierRef,
    },
  ].flatMap((field) =>
    field.value === null || field.value === undefined || field.value === ''
      ? []
      : [{ key: field.key, label: field.label, value: field.value }],
  );
  const payload = entry?.barcode?.payload ?? null;
  useFullBrightness(payload !== null);
  return (
    <BoardingPassView
      title={title}
      subtitle={dayDate(locale, leg?.sched_dep_at ?? booking?.startsAt, tz)}
      payload={payload}
      fields={fields}
      onClose={() => router.back()}
    />
  );
}
