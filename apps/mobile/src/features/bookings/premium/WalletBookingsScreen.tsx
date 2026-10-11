/**
 * The Wallet tab, Bookings half (premium): "Wallet" with search and the ink `+`, the Bookings |
 * Money switch, then the next booking as the dark card (1.06), the rest as rows (7.02), the crew's
 * finds, held mail, insurance and the past bookings. Empty, it shows the ways to fill it (7.01).
 * Search filters every booking of the trip on this phone. The `+` grows into "Add a booking".
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { useFormats } from '@/lib/i18n/formats';
import { Banner, IconButton, Skeleton, TextField, usePremiumTheme } from '@/ui/premium';
import { RootScreen, ZoomLink, type ShellAction } from '@/ui/premium/shell';

import { WalletGuideProvider } from '../data/wallet-guide';
import { zoneOf } from '../format';
import { bookingRoute, BOOKINGS_ROUTES, boardingPassRoute } from '../routes';
import { searchBookings } from '../stack/booking-search';
import { useDeckMeta } from '../stack/deck-meta';
import { useWalletScreen } from '../stack/use-wallet-screen';
import { BookingListRow } from './components/BookingListRow';
import { EmptyBookings } from './components/EmptyBookings';
import { NextUpCard } from './components/NextUpCard';
import { WalletExtras } from './components/WalletExtras';
import { WalletHalfSwitch } from './components/WalletHalfSwitch';
import { useAddChannels } from './use-add-channels';

/** The `+` sheet's route: a native form sheet the `+` morphs into. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, not copy.
export const ADD_SHEET_ROUTE: Href = '/wallet/bookings/add-sheet';

function Loading() {
  const t = usePremiumTheme();
  return (
    <View
      style={{ paddingHorizontal: t.space.gap16, gap: t.space.gap10 }}
      testID="bookings-loading"
    >
      <Skeleton height={200} radius={t.radius.hero} tone="block" />
      <Skeleton height={68} radius={t.radius.card} />
      <Skeleton height={68} radius={t.radius.card} />
    </View>
  );
}

export function WalletBookingsScreen() {
  useFormats();
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const data = useWalletScreen();
  const meta = useDeckMeta();
  const channels = useAddChannels(data.context);
  const [query, setQuery] = useState<string | null>(null);
  const tz = data.context.trip?.tz ?? undefined;
  const addLabel = t({ id: 'bookings.addCard', message: 'Add a booking' });
  const searchLabel = t({ id: 'bookings.premium.search', message: 'Search bookings' });

  // The kit has no search glyph for the drawn (Android) header yet: there the field stays in the
  // page instead of behind a header button.
  const ios = Platform.OS === 'ios';
  const searchAction: ShellAction = {
    key: 'search',
    label: searchLabel,
    sfSymbol: 'magnifyingglass',
    glyph: 'more',
    onPress: () => setQuery((current) => (current === null ? '' : null)),
    testID: 'bookings-search',
  };
  const actions: ShellAction[] = [
    ...(ios ? [searchAction] : []),
    {
      key: 'add',
      label: addLabel,
      sfSymbol: 'plus',
      glyph: 'plus',
      primary: true,
      onPress: () => router.push(ADD_SHEET_ROUTE),
      testID: 'bookings-add',
      ...(ios
        ? {
            element: (
              <ZoomLink
                href={ADD_SHEET_ROUTE}
                zoomId="wallet-add"
                accessibilityLabel={addLabel}
                testID="bookings-add"
              >
                <View pointerEvents="none">
                  <IconButton icon="plus" label={addLabel} tone="ink" size={36} />
                </View>
              </ZoomLink>
            ),
          }
        : {}),
    },
  ];

  const open = data.open;
  const rest = data.closed;
  const results =
    query === null || query.trim() === '' ? null : searchBookings(data.wallet.all, query);
  const shown = results ?? rest;
  const passOf = (id: string) =>
    data.wallet.entries.get(id)?.barcode != null ? () => router.push(boardingPassRoute(id)) : null;

  return (
    <WalletGuideProvider tripId={data.context.trip?.id ?? null}>
      <RootScreen
        title={t({ id: 'bookings.switch.label', message: 'Wallet' })}
        actions={actions}
        testID={`bookings-wallet-${data.state}`}
      >
        {({ scrollProps, largeTitle }) => (
          <ScrollView
            {...scrollProps}
            contentContainerStyle={{
              paddingBottom: theme.space.tabBarClearance,
              gap: theme.space.gap16,
            }}
          >
            {largeTitle}
            <WalletHalfSwitch current="bookings" />
            {query === null && (ios || data.state !== 'ready') ? null : (
              <View style={{ paddingHorizontal: theme.space.gap16 }}>
                <TextField
                  autoFocus={ios}
                  value={query ?? ''}
                  onChangeText={setQuery}
                  placeholder={searchLabel}
                  accessibilityLabel={searchLabel}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                  testID="bookings-search-field"
                />
              </View>
            )}
            {data.state === 'loading' ? (
              <Loading />
            ) : data.state === 'empty' && results === null ? (
              <EmptyBookings
                address={channels.address}
                onForward={channels.forward}
                onScan={channels.scan}
                onByHand={channels.byHand}
                onMailbox={channels.mailbox}
              />
            ) : (
              <>
                {results === null && open !== null ? (
                  <NextUpCard
                    booking={open}
                    when={meta(open, zoneOf(open.tz, tz))}
                    onOpen={() => router.push(bookingRoute(open.id))}
                    onPass={passOf(open.id)}
                  />
                ) : null}
                {results === null && data.banner !== null ? (
                  <View style={{ paddingHorizontal: theme.space.gap16 }}>
                    <Banner
                      tone="guide"
                      text={
                        data.banner.member === null
                          ? t({
                              id: 'bookings.banner.mine',
                              message: plural(data.banner.count, {
                                one: "Found # booking in your inbox that wasn't here yet.",
                                other: "Found # bookings in your inbox that weren't here yet.",
                              }),
                            })
                          : t({
                              id: 'bookings.banner.member',
                              message: plural(data.banner.count, {
                                one: `Found # booking in ${data.banner.member}'s inbox that wasn't here yet.`,
                                other: `Found # bookings in ${data.banner.member}'s inbox that weren't here yet.`,
                              }),
                            })
                      }
                      action={{
                        label: t({ id: 'bookings.banner.review', message: 'Review' }),
                        onPress: () => router.push(BOOKINGS_ROUTES.add),
                      }}
                      testID="bookings-import-banner"
                    />
                  </View>
                ) : null}
                <View
                  style={{ paddingHorizontal: theme.space.gap16, gap: theme.space.gap10 }}
                  testID="bookings-stack"
                >
                  {shown.map((booking) => (
                    <BookingListRow
                      key={booking.id}
                      booking={booking}
                      meta={meta(booking, zoneOf(booking.tz, tz))}
                      offline={data.wallet.offline.has(booking.id)}
                      onOpen={() => router.push(bookingRoute(booking.id))}
                    />
                  ))}
                </View>
                {results === null ? <WalletExtras data={data} /> : null}
              </>
            )}
          </ScrollView>
        )}
      </RootScreen>
    </WalletGuideProvider>
  );
}
