/**
 * A booking in full, premium (7.06 stay and every other kind, 7.10 flight, 7.12 cancelled flight,
 * 1.13 dark): push header with the options circle (7.15). A flight is its boarding card (light in
 * both modes), the pass and documents saved on this phone, and who sees it; anything else leads
 * with its kind tag and title, then when / where / code / travellers / price, the free-cancel line
 * (tap for the terms, word for word) and the shared toggle. The owner edits or deletes at the foot.
 */
import { useLingui } from '@lingui/react/macro';
import { Alert, StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Banner, EmptyState, PremiumThemeProvider, Tag, Text, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useKindLabel } from '../detail/labels';
import { useBookingDetail, type BookingDetail } from '../detail/use-booking-detail';
import { clock, dateTime, dayDate } from '../format';
import { openBookingOptions } from './booking-options';
import { ConfirmationCodeCard, useCopyCode } from './components/ConfirmationCode';
import { DetailFoot as Foot } from './components/DetailFoot';
import { DocsCard } from './components/DocsCard';
import { FlightTicket } from './components/FlightTicket';
import { KeyValueCard } from './components/KeyValueCard';
import { kindLook } from './components/kind-look';
import { ShareCard } from './components/ShareCard';

type Ready = Extract<BookingDetail, { kind: 'ready' }>;

function FlightBody({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const view = detail.view;
  if (view === null) return null;
  const tz = detail.tz;
  return (
    <>
      <View style={{ paddingHorizontal: th.space.gap16 }}>
        {/* The scannable card stays light in dark mode (1.13). */}
        <PremiumThemeProvider scheme="light">
          <FlightTicket
            view={view}
            day={dayDate(locale, view.departsAt, tz)}
            departs={clock(locale, view.departsAt, tz)}
            arrives={clock(locale, view.arrivesAt, tz)}
            boards={clock(locale, view.boardsAt, tz)}
            statusLabel={detail.status?.split(' · ')[0] ?? ''}
            notch={th.color.ground}
          />
        </PremiumThemeProvider>
      </View>
      {view.chip === 'cancelled' ? (
        <Text
          variant="rowText"
          tone="inkSecondary"
          style={{ paddingHorizontal: th.space.titleGutter }}
        >
          {t({
            id: 'bookings.premium.cancelledLine',
            message:
              "Cancelled by the airline. You're owed a free change or a refund: ask the airline.",
          })}
        </Text>
      ) : detail.status === null ? null : (
        <Text variant="caption" tone="muted" style={{ paddingHorizontal: th.space.titleGutter }}>
          {detail.status}
        </Text>
      )}
      <ConfirmationCodeCard code={detail.booking.supplierRef} />
      <DocsCard detail={detail} />
      <ShareCard detail={detail} />
    </>
  );
}

function OtherBody({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const kindLabel = useKindLabel();
  const copy = useCopyCode();
  const { booking } = detail;
  const look = kindLook(booking.kind, th.color);
  const policy = booking.cancelPolicyText ?? '';
  return (
    <>
      <View style={[styles.titleBlock, { paddingHorizontal: th.space.titleGutter }]}>
        <Tag label={kindLabel(booking.kind)} color={look.bg} rotate={-4} />
        <Text variant="display" accessibilityRole="header" testID="bookings-detail-title">
          {booking.title}
        </Text>
        {booking.status === 'cancelled' ? (
          <Text variant="label" color={th.color.destructive.text}>
            {t({ id: 'bookings.detail.cancelled', message: 'Cancelled' })}
          </Text>
        ) : null}
      </View>
      <KeyValueCard
        testID="bookings-detail-facts"
        rows={[
          {
            key: 'when',
            label: t({ id: 'bookings.detail.when', message: 'When' }),
            value: detail.when,
          },
          {
            key: 'where',
            label: t({ id: 'bookings.detail.where', message: 'Where' }),
            value: booking.location ?? '',
          },
          {
            key: 'ref',
            label: t({ id: 'bookings.detail.ref', message: 'Confirmation code' }),
            value: booking.supplierRef ?? '',
            mono: true,
            private: true,
            onPress: () => copy(booking.supplierRef ?? ''),
          },
          {
            key: 'who',
            label: t({ id: 'bookings.detail.who', message: 'Travellers' }),
            value: detail.travellers,
          },
          {
            key: 'price',
            label: t({ id: 'bookings.detail.price', message: 'Price' }),
            value: detail.price ?? '',
            private: true,
          },
          {
            key: 'room',
            label: t({ id: 'bookings.detail.room', message: 'Room' }),
            value: booking.details.room ?? '',
          },
          {
            key: 'meet',
            label: t({ id: 'bookings.detail.meet', message: 'Meeting point' }),
            value: booking.details.meeting_point ?? '',
          },
          {
            key: 'notes',
            label: t({ id: 'bookings.detail.notes', message: 'Notes' }),
            value: booking.details.notes ?? '',
          },
        ]}
      />
      {booking.freeCancelUntil === null ? null : (
        <View style={{ paddingHorizontal: th.space.gutter }}>
          <Banner
            tone="success"
            text={t({
              id: 'bookings.detail.freeCancel',
              message: `Free cancellation until ${dateTime(locale, booking.freeCancelUntil, detail.tz)}`,
            })}
            {...(policy === ''
              ? {}
              : {
                  action: {
                    label: t({ id: 'bookings.premium.terms', message: 'Terms' }),
                    // The policy exactly as the confirmation words it.
                    onPress: () =>
                      Alert.alert(t({ id: 'bookings.premium.terms', message: 'Terms' }), policy),
                  },
                })}
            testID="bookings-free-cancel"
          />
        </View>
      )}
      <DocsCard detail={detail} />
      <ShareCard detail={detail} />
    </>
  );
}

export function BookingDetailPremium({ bookingId }: { readonly bookingId: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const detail = useBookingDetail(bookingId);
  const backLabel = t({ id: 'bookings.back', message: 'Bookings' });
  if (detail.kind === 'missing') {
    return (
      <PushScreen title={backLabel} backLabel={backLabel} testID="bookings-detail-missing">
        {detail.loaded ? (
          <EmptyState
            title={t({ id: 'bookings.premium.missingTitle', message: 'Not in the wallet' })}
            line={t({
              id: 'bookings.premium.missingLine',
              message: 'It was deleted, or it belongs to a trip you left.',
            })}
          />
        ) : null}
      </PushScreen>
    );
  }
  const { booking, view } = detail;
  const shared = view === null ? booking.visibility === 'crew' : booking.flightCrewVisible;
  const header =
    view === null
      ? booking.title
      : [
          view.number,
          view.seat === null
            ? null
            : t({ id: 'bookings.premium.seat', message: `Seat ${view.seat}` }),
        ]
          .filter(Boolean)
          .join(' · ');
  const shareText =
    view === null
      ? [booking.title, detail.when].join('\n')
      : `${view.number} · ${view.from} → ${view.to}\n${dayDate(locale, view.departsAt, detail.tz)} ${clock(locale, view.departsAt, detail.tz)}`;
  return (
    <PushScreen
      title={
        view === null
          ? t({ id: 'bookings.premium.booking', message: 'Booking' })
          : t({ id: 'bookings.premium.flight', message: 'Flight' })
      }
      backLabel={backLabel}
      action={{
        key: 'options',
        label: t({ id: 'bookings.premium.options', message: 'Booking options' }),
        // The flight's header carries share (7.10), a stay's the options circle (7.06); both open
        // the same options, sharing first.
        // eslint-disable-next-line lingui/no-unlocalized-strings -- SF Symbol names, never copy.
        sfSymbol: view === null ? 'ellipsis' : 'square.and.arrow.up',
        glyph: view === null ? 'more' : 'share',
        onPress: () =>
          openBookingOptions({
            header,
            shareText,
            onNotOurs: booking.mine && shared ? () => detail.onShare(false) : null,
            onDelete: booking.mine ? () => void detail.deleteIt() : null,
          }),
        testID: 'bookings-options',
      }}
      testID="bookings-detail"
    >
      <View style={[styles.body, { gap: th.space.gap16 }]}>
        {view === null ? <OtherBody detail={detail} /> : <FlightBody detail={detail} />}
        <Foot detail={detail} />
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  titleBlock: { gap: 8, alignItems: 'flex-start' },
});
