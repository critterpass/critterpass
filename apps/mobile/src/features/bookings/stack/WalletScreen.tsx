/**
 * The wallet (3h-1) over synced rows: the trip's bookings as a stack with the soonest relevant one
 * open, flights live from their legs (a `flight.status` change reaches the card when its row
 * syncs), the offline count from the cached bundle, and the banner for bookings found in a
 * crewmate's inbox. Renders offline.
 */
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { useLiveRows } from '../data/live-rows';
import { soonestRelevant, stackOrder, type WalletBooking } from '../data/model';
import { CANDIDATES_SQL, CANDIDATES_TABLES, type CandidateRow } from '../data/queries';
import { useBookingsServices } from '../data/services';
import { useWallet, type Wallet } from '../data/use-wallet';
import { useWalletContext, type WalletContext } from '../data/use-wallet-context';
import { FlightCard } from '../flight-card/FlightCard';
import { flightView } from '../flight-card/flight-model';
import { gateChanged } from '../flight-card/gate-memory';
import { zoneOf } from '../format';
import { InsuranceCard } from '../insurance/InsuranceCard';
import { HeldMailCard } from '../link-code/HeldMailCard';
import { pickPolicy, useInsurancePolicies } from '../insurance/insurance-data';
import { bookingRoute, BOOKINGS_ROUTES, boardingPassRoute } from '../routes';
import { bannerOf } from './banner';
import { BookingBody } from './BookingBody';
import { useDeckMeta } from './deck-meta';
import { WalletView } from './WalletView';
import { WalletGuideProvider } from '../data/wallet-guide';

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
  const context = useWalletContext();
  const services = useBookingsServices();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const meta = useDeckMeta();
  const candidates = useLiveRows<CandidateRow>(
    CANDIDATES_SQL,
    context.uid === null ? null : [context.uid, context.crewId ?? '', context.trip?.id ?? ''],
    CANDIDATES_TABLES,
  );
  const insurance = useInsurancePolicies();
  const policy = pickPolicy(insurance.policies, context.trip?.id ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const names = useMemo(
    () => new Map(context.members.map((member) => [member.userId, member.name])),
    [context.members],
  );
  const selected = picked ?? soonestRelevant(wallet.upcoming, services.now());
  const { closed, open } = stackOrder(wallet.upcoming, selected);
  const tz = context.trip?.tz ?? undefined;
  const loading = context.status === 'loading' || (context.status === 'ready' && !wallet.loaded);
  const state = loading ? 'loading' : wallet.upcoming.length === 0 ? 'empty' : 'ready';
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
        banner={bannerOf(candidates.rows, context.uid, names)}
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
        onSelect={setPicked}
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
