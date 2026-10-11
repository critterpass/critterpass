/**
 * The wallet (3h-1) over synced rows: the trip's bookings as a stack with the soonest relevant one
 * open, flights live from their legs (a `flight.status` change reaches the card when its row
 * syncs), the offline count from the cached bundle, and the banner for bookings found in a
 * crewmate's inbox. Renders offline.
 */
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import type { WalletBooking } from '../data/model';
import type { Wallet } from '../data/use-wallet';
import type { WalletContext } from '../data/use-wallet-context';

import { useBookingsServices } from '../data/services';
import { FlightCard } from '../flight-card/FlightCard';
import { flightView } from '../flight-card/flight-model';
import { gateChanged } from '../flight-card/gate-memory';
import { zoneOf } from '../format';
import { InsuranceCard } from '../insurance/InsuranceCard';
import { HeldMailCard } from '../link-code/HeldMailCard';
import { bookingRoute, BOOKINGS_ROUTES, boardingPassRoute } from '../routes';
import { BookingBody } from './BookingBody';
import { useDeckMeta } from './deck-meta';
import { useWalletScreen } from './use-wallet-screen';
import { WalletView } from './WalletView';
import { WalletGuideProvider } from '../data/wallet-guide';
import { useFormats } from '@/lib/i18n/formats';

export function OpenBody({
  booking,
  wallet,
  context,
}: {
  readonly booking: WalletBooking;
  readonly wallet: Wallet;
  readonly context: WalletContext;
}): ReactNode {
  const tz = zoneOf(booking.tz, context.trip?.tz);
  const entry = wallet.entries.get(booking.id);
  const hasPass = entry?.barcode != null;
  const onPass = () => router.push(boardingPassRoute(booking.id));
  if (booking.kind === 'flight') {
    const leg = booking.segments[0];
    const view = flightView(booking, wallet.segments, {
      gateChanged: leg === undefined ? false : gateChanged(leg.id, leg.gate),
    });
    if (view !== null) {
      const names = view.coTravellerIds.map(
        (id) => context.members.find((member) => member.userId === id)?.name ?? '',
      );
      return (
        <FlightCard
          view={view}
          tz={tz}
          coTravellers={names.filter((name) => name !== '')}
          hasPass={hasPass}
          mine={booking.mine}
          onPass={onPass}
          testID="bookings-flight"
        />
      );
    }
  }
  return (
    <BookingBody
      booking={booking}
      tz={tz}
      hasPass={hasPass}
      onPass={onPass}
      testID="bookings-body"
    />
  );
}

/** A dialable `tel:` link from a printed number ("+65 6812 3456"). */
export function telUrl(phone: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a URL scheme, not copy
  return `tel:${phone.replace(/[^\d+]/gu, '')}`;
}

export function WalletScreen() {
  useFormats();
  const { context, wallet, state, closed, open, banner, insurance, pick } = useWalletScreen();
  const services = useBookingsServices();
  const meta = useDeckMeta();
  const policy = insurance.policy;
  const tz = context.trip?.tz ?? undefined;
  return (
    <WalletGuideProvider tripId={context.trip?.id ?? null}>
      <WalletView
        state={state}
        offlineCount={wallet.offline.size}
        closed={closed.map((booking) => ({
          key: booking.id,
          title: booking.title,
          meta: meta(booking, zoneOf(booking.tz, tz)),
          tone: booking.tone,
          icon: booking.icon,
        }))}
        open={open === null ? null : { key: open.id, tone: open.tone }}
        openBody={
          open === null ? null : <OpenBody booking={open} wallet={wallet} context={context} />
        }
        banner={banner}
        archiveCount={wallet.past.length}
        heldMail={
          context.heldMail > 0 ? (
            <HeldMailCard
              count={context.heldMail}
              codeSent={context.heldMailCodeSent}
              onLink={() =>
                router.push({ pathname: BOOKINGS_ROUTES.add, params: { start: 'link' } })
              }
              onPaste={() =>
                router.push({ pathname: BOOKINGS_ROUTES.add, params: { start: 'paste' } })
              }
            />
          ) : null
        }
        insurance={
          insurance.loaded ? (
            <InsuranceCard
              policy={policy}
              onOpen={() => router.push(BOOKINGS_ROUTES.insurance)}
              onCall={(phone) => void services.openUrl(telUrl(phone))}
            />
          ) : null
        }
        onSelect={pick}
        onOpenDetail={() => {
          if (open !== null) router.push(bookingRoute(open.id));
        }}
        onReview={() => router.push(BOOKINGS_ROUTES.add)}
        onAdd={() => router.push(BOOKINGS_ROUTES.add)}
        onChannel={(channel) =>
          router.push({ pathname: BOOKINGS_ROUTES.add, params: { start: channel } })
        }
        onArchive={() => router.push(BOOKINGS_ROUTES.archive)}
      />
    </WalletGuideProvider>
  );
}
