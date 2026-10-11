/**
 * Past bookings (7.14): a search field (flights, stays, confirmation codes; results filter as you
 * type and the keyboard drops on scroll), then the trip's past bookings grouped by month under the
 * trip's name, with "Recap" when the trip has one. A cancelled booking is faded and struck with a
 * pink tag. Rows open the booking. Empty: the Foundations empty state.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { IconTile } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { useScreenHref } from '@/lib/navigation/screen-registry';
import {
  EmptyState,
  PressableScale,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { WalletBooking } from '../data/model';
import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { WalletGuideProvider } from '../data/wallet-guide';
import { zoneOf } from '../format';
import { bookingRoute } from '../routes';
import { searchBookings } from '../stack/booking-search';
import { useDeckMeta } from '../stack/deck-meta';
import { kindLook } from './components/kind-look';

function monthOf(locale: string, iso: string | null): string {
  if (iso === null) return '';
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl option values, not copy
  return format.date(locale, new Date(iso), { month: 'long', year: 'numeric' });
}

function ArchiveRow(props: {
  readonly booking: WalletBooking;
  readonly sub: string;
  readonly first: boolean;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { booking } = props;
  const look = kindLook(booking.kind, th.color);
  const cancelled = booking.status === 'cancelled';
  return (
    <PressableScale
      onPress={() => router.push(bookingRoute(booking.id))}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityLabel={[booking.title, props.sub].join(', ')}
      testID={`bookings-archive-${booking.id}`}
    >
      <View
        style={[
          styles.row,
          props.first ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
          cancelled ? styles.faded : null,
        ]}
      >
        <IconTile name={look.icon} bg={look.bg} color={look.color} size={40} />
        <View style={styles.flex}>
          <Text variant="rowTextStrong" numberOfLines={1} style={cancelled ? styles.struck : null}>
            {booking.title}
          </Text>
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {props.sub}
          </Text>
        </View>
        {cancelled ? (
          <StatusTag
            label={t({ id: 'bookings.detail.cancelled', message: 'Cancelled' })}
            tone="voteOpen"
          />
        ) : null}
      </View>
    </PressableScale>
  );
}

export function ArchivePremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const context = useWalletContext();
  const tripId = context.trip?.id ?? null;
  const wallet = useWallet(tripId, context.uid);
  const meta = useDeckMeta();
  const recap = useScreenHref('3m-1', { tripId: tripId ?? '' });
  const [query, setQuery] = useState('');
  const shown = searchBookings(wallet.past, query);
  const groups = useMemo(() => {
    const out = new Map<string, WalletBooking[]>();
    for (const booking of shown) {
      const key = monthOf(locale, booking.startsAt);
      out.set(key, [...(out.get(key) ?? []), booking]);
    }
    return [...out.entries()];
  }, [shown, locale]);
  const tripName = context.trip?.destination_name ?? '';
  const backLabel = t({ id: 'bookings.back', message: 'Bookings' });
  return (
    <WalletGuideProvider tripId={tripId}>
      <PushScreen
        title={t({ id: 'bookings.archive.title', message: 'Past bookings' })}
        backLabel={backLabel}
        scroll={false}
        testID="bookings-archive"
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40, gap: 22 }}
        >
          <View
            style={[
              styles.search,
              { marginHorizontal: th.space.gap16, backgroundColor: th.color.segmentTrack },
            ]}
          >
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t({
                id: 'bookings.archive.search',
                message: 'Flights, stays, confirmation codes',
              })}
              placeholderTextColor={th.color.placeholder}
              selectionColor={th.color.caret}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel={t({
                id: 'bookings.archive.searchLabel',
                message: 'Search past bookings',
              })}
              style={[styles.input, { color: th.color.ink }]}
              testID="bookings-archive-search"
            />
          </View>
          {wallet.past.length === 0 ? (
            <EmptyState
              title={t({ id: 'bookings.archive.emptyTitle', message: 'Nothing past yet' })}
              line={t({ id: 'bookings.archive.empty', message: 'Nothing has ended yet.' })}
            />
          ) : shown.length === 0 ? (
            <Text variant="body" tone="muted" align="center">
              {t({ id: 'bookings.archive.noMatch', message: 'Nothing matches that.' })}
            </Text>
          ) : (
            groups.map(([month, bookings], index) => (
              <View key={month} style={{ gap: th.space.gap8 }}>
                <View style={[styles.head, { paddingHorizontal: th.space.titleGutter - 2 }]}>
                  <Text variant="title" numberOfLines={1} style={styles.flex}>
                    {[tripName, month].filter(Boolean).join(' · ')}
                  </Text>
                  {index === 0 && recap !== undefined ? (
                    <TextButton
                      label={t({ id: 'bookings.archive.recap', message: 'Recap' })}
                      color={th.color.status.rain.text}
                      onPress={() => router.push(recap)}
                      testID="bookings-archive-recap"
                    />
                  ) : null}
                </View>
                <View
                  style={[
                    styles.card,
                    {
                      marginHorizontal: th.space.gutter,
                      borderRadius: th.radius.card,
                      backgroundColor: th.color.card,
                      boxShadow: th.shadow.card,
                    },
                  ]}
                >
                  {bookings.map((booking, row) => (
                    <ArchiveRow
                      key={booking.id}
                      booking={booking}
                      sub={meta(booking, zoneOf(booking.tz, context.trip?.tz))}
                      first={row === 0}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </PushScreen>
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({
  search: { height: 46, borderRadius: 23, paddingHorizontal: 16, justifyContent: 'center' },
  input: { fontSize: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingLeft: 10,
    paddingRight: 14,
  },
  flex: { flex: 1, minWidth: 0 },
  faded: { opacity: 0.55 },
  struck: { textDecorationLine: 'line-through' },
});
