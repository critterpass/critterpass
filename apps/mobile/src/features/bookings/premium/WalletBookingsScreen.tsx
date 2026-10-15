/**
 * The Wallet tab, Bookings half (premium): "Wallet" with search and the ink `+`, the Bookings |
 * Money switch, how many bookings open offline, then the wallet stack with the next booking in
 * front (7.02) and the rest as rows under it, the crew's
 * finds, held mail, insurance and the past bookings. Empty, it shows the ways to fill it (7.01)
 * above the same held mail, insurance and past bookings.
 * Search filters every booking of the trip on this phone. The `+` grows into "Add a booking".
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useFormats } from '@/lib/i18n/formats';
import { Banner, SearchField, Skeleton, usePremiumTheme } from '@/ui/premium';
import { RootScreen, TabPageScroll, type ShellAction } from '@/ui/premium/shell';

import { WalletGuideProvider } from '../data/wallet-guide';
import { zoneOf } from '../format';
import { bookingRoute, BOOKINGS_ROUTES, boardingPassRoute } from '../routes';
import { searchBookings } from '../stack/booking-search';
import { useDeckMeta } from '../stack/deck-meta';
import { useWalletScreen } from '../stack/use-wallet-screen';
import { BookingListRow } from './components/BookingListRow';
import { EmptyBookings } from './components/EmptyBookings';
import { OfflineBadge } from './components/OfflineBadge';
import { WalletExtras } from './components/WalletExtras';
import { WalletHalfSwitch } from './components/WalletHalfSwitch';
import { STACK_DEPTH, WalletStack } from './components/WalletStack';
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

  const searchAction: ShellAction = {
    key: 'search',
    label: searchLabel,
    sfSymbol: 'magnifyingglass',
    glyph: 'search',
    onPress: () => setQuery((current) => (current === null ? '' : null)),
    testID: 'bookings-search',
  };
  const actions: ShellAction[] = [
    searchAction,
    {
      key: 'add',
      label: addLabel,
      sfSymbol: 'plus',
      glyph: 'plus',
      primary: true,
      onPress: () => router.push(ADD_SHEET_ROUTE),
      testID: 'bookings-add',
    },
  ];

  const open = data.open;
  const rest = data.closed;
  const results =
    query === null || query.trim() === '' ? null : searchBookings(data.wallet.all, query);
  // Searching lists every match; otherwise the stack draws the next few and the rest follow it.
  const shown = results ?? rest.slice(open === null ? 0 : STACK_DEPTH);
  const passOf = (id: string) =>
    data.wallet.entries.get(id)?.barcode != null ? () => router.push(boardingPassRoute(id)) : null;

  // Named as the current wallet names them, so both read the same catalog entry.
  const count = data.banner?.count ?? 0;
  const member = data.banner?.member ?? '';
  return (
    <WalletGuideProvider tripId={data.context.trip?.id ?? null}>
      <RootScreen
        title={t({ id: 'bookings.switch.label', message: 'Wallet' })}
        actions={actions}
        testID={`bookings-wallet-${data.state}`}
      >
        {({ scrollProps, largeTitle }) => (
          <TabPageScroll
            {...scrollProps}
            contentContainerStyle={{
              paddingBottom: theme.space.tabBarClearance,
              gap: theme.space.gap16,
            }}
          >
            {largeTitle}
            <WalletHalfSwitch current="bookings" />
            {query === null ? null : (
              <View style={{ paddingHorizontal: theme.space.gap16 }}>
                <SearchField
                  autoFocus
                  value={query ?? ''}
                  onChangeText={setQuery}
                  placeholder={searchLabel}
                  accessibilityLabel={searchLabel}
                  returnKeyType="search"
                  testID="bookings-search-field"
                />
              </View>
            )}
            {data.state === 'loading' ? (
              <Loading />
            ) : data.state === 'empty' && results === null ? (
              <>
                <EmptyBookings
                  address={channels.address}
                  onForward={channels.forward}
                  onScan={channels.scan}
                  onByHand={channels.byHand}
                  onMailbox={channels.mailbox}
                />
                {/* Held mail, insurance and past bookings show with no bookings too. */}
                <WalletExtras data={data} />
              </>
            ) : (
              <>
                {results === null && open !== null ? (
                  <>
                    {data.wallet.offline.size === 0 ? null : (
                      <OfflineBadge count={data.wallet.offline.size} />
                    )}
                    <WalletStack
                      front={open}
                      behind={rest}
                      metaOf={(booking) => meta(booking, zoneOf(booking.tz, tz))}
                      tz={zoneOf(open.tz, tz)}
                      onPick={data.pick}
                      onOpen={() => router.push(bookingRoute(open.id))}
                      onPass={passOf(open.id)}
                    />
                  </>
                ) : null}
                {results === null && data.banner !== null ? (
                  <View style={{ paddingHorizontal: theme.space.gap16 }}>
                    <Banner
                      tone="guide"
                      text={
                        data.banner.member === null
                          ? t({
                              id: 'bookings.banner.mine',
                              message: plural(count, {
                                one: "Found # booking in your inbox that wasn't here yet.",
                                other: "Found # bookings in your inbox that weren't here yet.",
                              }),
                            })
                          : t({
                              id: 'bookings.banner.member',
                              message: plural(count, {
                                one: `Found # booking in ${member}'s inbox that wasn't here yet.`,
                                other: `Found # bookings in ${member}'s inbox that weren't here yet.`,
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
          </TabPageScroll>
        )}
      </RootScreen>
    </WalletGuideProvider>
  );
}
