/**
 * "Who sees it" (7.06, 7.10): one toggle row. For a flight the crew sees only the flight and its
 * times, so two tags say what is shared and what stays the reader's (seat, pass). Only the
 * booking's owner can change it; others read where it stands.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Text, Toggle, usePremiumTheme } from '@/ui/premium';

import type { BookingDetail } from '../../detail/use-booking-detail';

type Ready = Extract<BookingDetail, { kind: 'ready' }>;

function Pill({
  label,
  bg,
  fg,
}: {
  readonly label: string;
  readonly bg: string;
  readonly fg: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text variant="badge" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ShareCard({ detail }: { readonly detail: Ready }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { booking } = detail;
  const flight = booking.kind === 'flight';
  const shared = flight ? booking.flightCrewVisible : booking.visibility === 'crew';
  const title = flight
    ? t({ id: 'bookings.detail.shareFlight', message: 'Crew sees this flight' })
    : t({ id: 'bookings.detail.shareBooking', message: 'Shared with the crew' });
  return (
    <View
      style={[
        styles.card,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.banner,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="bookings-share-card"
    >
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="rowTitle">{title}</Text>
          {flight ? null : (
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'bookings.detail.shareBookingSub',
                message: 'Off keeps it in your wallet only.',
              })}
            </Text>
          )}
        </View>
        <Toggle
          value={shared}
          onChange={detail.onShare}
          disabled={!booking.mine}
          accessibilityLabel={title}
          testID="bookings-share-toggle"
        />
      </View>
      {flight ? (
        <View style={styles.pills}>
          <Pill
            label={t({ id: 'bookings.premium.crewSees', message: 'Crew sees · flight, times' })}
            bg={th.color.status.booked.bg}
            fg={th.color.status.booked.text}
          />
          <Pill
            label={t({ id: 'bookings.premium.onlyYou', message: 'Only you · seat, pass' })}
            bg={th.color.status.voteOpen.bg}
            fg={th.color.status.voteOpen.text}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, paddingHorizontal: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
