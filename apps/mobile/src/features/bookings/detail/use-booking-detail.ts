/**
 * A booking's detail for either UI: the booking and its flight view, its lines already worded
 * (when, travellers, price, live status), the documents saved on this phone, and what can be done
 * with it (the pass, sharing, "I landed", edit, delete, the supplier's cancel).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useCommand } from '@/data/commands/use-command';
import { displayWithHome, useMoneyDisplay } from '@/data/money';
import { useFormats } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import { useCommandFeedback } from '@/motion/island-toast';

import {
  deleteBookingCommand,
  reportLandedCommand,
  setBookingVisibilityCommand,
  setFlightCrewVisibilityCommand,
} from '../data/commands';
import { useBookingsServices } from '../data/services';
import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { canReportLanded, flightView } from '../flight-card/flight-model';
import { useChipLabel, useUpdatedLine } from '../flight-card/labels';
import { clock, dayDate, price as formatPrice, shortDate, zoneOf } from '../format';
import { boardingPassRoute, BOOKINGS_ROUTES, editBookingRoute } from '../routes';
import { useTripGuide } from '../supplier/data/use-trip-guide';
import { cancelRoute } from '../supplier/routes';
import type { DetailDoc } from './view-types';

export type BookingDetail = ReturnType<typeof useBookingDetail>;

export function useBookingDetail(bookingId: string) {
  const context = useWalletContext();
  const { name: guideName } = useTripGuide(context.trip?.id ?? null);
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const services = useBookingsServices();
  const locale = useLocale();
  useFormats();
  useMoneyDisplay();
  const { t } = useLingui();
  const chipLabel = useChipLabel();
  const updatedLine = useUpdatedLine();
  const del = useCommand(deleteBookingCommand);
  const share = useCommand(setBookingVisibilityCommand);
  const shareFlight = useCommand(setFlightCrewVisibilityCommand);
  const landed = useCommand(reportLandedCommand);
  const { report } = useCommandFeedback();
  const booking = wallet.all.find((item) => item.id === bookingId);
  if (booking === undefined) return { kind: 'missing', loaded: wallet.loaded } as const;
  const tz = zoneOf(booking.tz, context.trip?.tz);
  const names = new Map(context.members.map((member) => [member.userId, member.name]));
  const view = booking.kind === 'flight' ? flightView(booking, wallet.segments) : null;
  const start = view?.departsAt ?? booking.startsAt;
  const end = view?.arrivesAt ?? booking.endsAt;
  const when =
    booking.kind === 'stay'
      ? [shortDate(locale, booking.startsAt, tz), shortDate(locale, booking.endsAt, tz)]
          .filter((part) => part !== '')
          .join(' → ')
      : [`${dayDate(locale, start, tz)} ${clock(locale, start, tz)}`.trim(), clock(locale, end, tz)]
          .filter((part) => part !== '')
          .join(' → ');
  const payer = booking.paidBy === null ? null : (names.get(booking.paidBy) ?? null);
  const amount =
    booking.priceMinor === null || booking.currency === null
      ? null
      : displayWithHome(
          formatPrice(locale, booking.priceMinor, booking.currency),
          booking.priceMinor,
          booking.currency,
          locale,
        );
  const price =
    amount === null
      ? null
      : payer === null
        ? amount
        : t({ id: 'bookings.detail.paidBy', message: `${amount} · paid by ${payer}` });
  const status =
    view === null
      ? null
      : [
          chipLabel(view.chip, view.delayMin),
          view.source === null ? null : updatedLine(clock(locale, view.source.at, tz)),
        ]
          .filter(Boolean)
          .join(' · ');
  const entry = wallet.entries.get(booking.id);
  const orderId = booking.supplierOrderId;
  const docs: DetailDoc[] = wallet.attachments
    .filter((doc) => doc.booking_id === booking.id)
    .map((doc, index) => ({
      id: doc.id,
      label: t({ id: 'bookings.detail.doc', message: `Document ${index + 1}` }),
      uri: entry?.files[doc.id] ?? null,
    }));
  const deleteIt = async () => {
    // The queued delete takes the booking out of the wallet's rows at once: leave for the wallet
    // first, so this screen never draws "not in the wallet" on the way out.
    const sent = del.send({ booking_id: booking.id, base_version: booking.version });
    router.dismissTo(BOOKINGS_ROUTES.wallet);
    await sent;
  };
  const canLand = booking.mine && view !== null && canReportLanded(view, services.now());
  return {
    kind: 'ready',
    tripId: context.trip?.id ?? null,
    guideName,
    booking,
    view,
    names,
    tz,
    when,
    travellers: format.list(
      locale,
      booking.travellerIds.map((id) => names.get(id) ?? '').filter((name) => name !== ''),
    ),
    payer,
    amount,
    price,
    status,
    canReportLanded: canLand,
    docs,
    hasPass: booking.mine && entry?.barcode != null,
    onPass: () => router.push(boardingPassRoute(booking.id)),
    onDoc: (doc: DetailDoc) => {
      if (doc.uri !== null) void services.openUrl(doc.uri);
    },
    onShare: (next: boolean) => {
      const sent =
        booking.kind === 'flight'
          ? shareFlight.send({ booking_id: booking.id, visible: next })
          : share.send({ booking_id: booking.id, visibility: next ? 'crew' : 'personal' });
      void sent.then((result) => report(result, { offlineCapable: true, id: 'bookings-share' }));
    },
    onLanded: () => {
      if (landed.pending) return;
      void landed.send({ booking_id: booking.id }).then((result) =>
        report(result, {
          offlineCapable: true,
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast key, not copy
          id: `bookings-landed-${booking.id}`,
          done: t({
            id: 'bookings.detail.landedToast',
            message: `Welcome in. ${guideName} tells the crew.`,
          }),
        }),
      );
    },
    onEdit: () => router.push(editBookingRoute(booking.id)),
    deleteIt,
    onSupplierCancel:
      booking.mine && orderId !== null && booking.status !== 'cancelled'
        ? () => router.push(cancelRoute(orderId, booking.title))
        : null,
  } as const;
}
