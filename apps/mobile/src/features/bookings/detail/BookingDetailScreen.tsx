/**
 * A booking's detail over synced rows: sharing, "I landed", documents from the phone's own copy,
 * edit and delete (asked once, the split expense stays in Money).
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { Sheet } from '@/ui/sheet/Sheet';
import { ConfirmSheet, type ConfirmSheetProps } from '@/ui/states/ConfirmSheet';
import { makeStyles } from '@/ui/theme';

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
import { useChipLabel, useSourceLine } from '../flight-card/labels';
import { clock, dayDate, price as formatPrice, shortDate, zoneOf } from '../format';
import { boardingPassRoute, BOOKINGS_ROUTES, editBookingRoute } from '../routes';
import { BookingDetailView, type DetailDoc } from './BookingDetailView';
import { BookingMissing } from './BookingMissing';

const useConfirmStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.space['20'], paddingBottom: th.space['24'] },
}));

/** The delete confirm, risen in a sheet over the tab bar. */
function DeleteConfirm(props: ConfirmSheetProps) {
  const styles = useConfirmStyles();
  return (
    <Sheet detents={['fit']} onDismiss={props.onCancel} accessibilityLabel={props.title}>
      <View style={styles.body}>
        <ConfirmSheet {...props} />
      </View>
    </Sheet>
  );
}

export function BookingDetailScreen({ bookingId }: { readonly bookingId: string }) {
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const services = useBookingsServices();
  const locale = useLocale();
  const { t } = useLingui();
  const chipLabel = useChipLabel();
  const sourceLine = useSourceLine();
  const del = useCommand(deleteBookingCommand);
  const share = useCommand(setBookingVisibilityCommand);
  const shareFlight = useCommand(setFlightCrewVisibilityCommand);
  const landed = useCommand(reportLandedCommand);
  const [confirming, setConfirming] = useState(false);
  const booking = wallet.all.find((item) => item.id === bookingId);
  if (booking === undefined) return <BookingMissing loaded={wallet.loaded} />;
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
      : formatPrice(locale, booking.priceMinor, booking.currency);
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
          view.source === null
            ? null
            : sourceLine(view.source.name, clock(locale, view.source.at, tz)),
        ]
          .filter(Boolean)
          .join(' · ');
  const entry = wallet.entries.get(booking.id);
  const docs: DetailDoc[] = wallet.attachments
    .filter((doc) => doc.booking_id === booking.id)
    .map((doc, index) => ({
      id: doc.id,
      label: t({ id: 'bookings.detail.doc', message: `Document ${index + 1}` }),
      uri: entry?.files[doc.id] ?? null,
    }));
  const deleteIt = async () => {
    setConfirming(false);
    // The queued delete takes the booking out of the wallet's rows at once: leave for the wallet
    // first, so this screen never draws "not in the wallet" on the way out.
    const sent = del.send({ booking_id: booking.id, base_version: booking.version });
    router.replace(BOOKINGS_ROUTES.wallet);
    await sent;
  };
  return (
    <>
      <BookingDetailView
        booking={booking}
        tz={tz}
        when={when}
        travellers={format.list(
          locale,
          booking.travellerIds.map((id) => names.get(id) ?? '').filter((name) => name !== ''),
        )}
        price={price}
        status={status}
        canReportLanded={booking.mine && view !== null && canReportLanded(view, services.now())}
        docs={docs}
        hasPass={booking.mine && entry?.barcode != null}
        onPass={() => router.push(boardingPassRoute(booking.id))}
        onDoc={(doc) => {
          if (doc.uri !== null) void services.openUrl(doc.uri);
        }}
        onShare={(next) => {
          if (booking.kind === 'flight') {
            void shareFlight.send({ booking_id: booking.id, visible: next });
          } else {
            void share.send({ booking_id: booking.id, visibility: next ? 'crew' : 'personal' });
          }
        }}
        onLanded={() => {
          void landed.send({ booking_id: booking.id }).then(() =>
            toast.show({
              // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast key, not copy
              id: `bookings-landed-${booking.id}`,
              title: t({
                id: 'bookings.detail.landedToast',
                message: 'Welcome in. Tokek tells the crew.',
              }),
            }),
          );
        }}
        onEdit={() => router.push(editBookingRoute(booking.id))}
        onDelete={() => setConfirming(true)}
      />
      {confirming ? (
        <DeleteConfirm
          title={t({ id: 'bookings.delete.title', message: 'Delete this booking?' })}
          consequences={[
            t({ id: 'bookings.delete.wallets', message: 'It leaves everyone’s wallet.' }),
            t({ id: 'bookings.delete.expense', message: 'Its expense stays in Money.' }),
          ]}
          confirmLabel={t({ id: 'bookings.delete.confirm', message: 'Delete booking' })}
          mode="button"
          onConfirm={() => void deleteIt()}
          onCancel={() => setConfirming(false)}
          testID="bookings-delete-confirm"
        />
      ) : null}
    </>
  );
}
