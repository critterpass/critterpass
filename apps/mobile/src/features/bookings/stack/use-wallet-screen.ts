/**
 * What either wallet screen shows, over synced rows (renders offline): the trip's bookings with the
 * soonest relevant one open (or the one picked), flights live from their legs, the offline count,
 * the crew-finds banner, held mail and the insurance policy. A trip hub's Bookings tile names its
 * trip in the route, and the wallet switches to it before the first paint.
 */
import { useLocalSearchParams } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';

import { useLiveRows } from '../data/live-rows';
import { soonestRelevant, stackOrder, type WalletBooking } from '../data/model';
import { CANDIDATES_SQL, CANDIDATES_TABLES, type CandidateRow } from '../data/queries';
import { useBookingsServices } from '../data/services';
import { useWallet, type Wallet } from '../data/use-wallet';
import { useWalletContext, type WalletContext } from '../data/use-wallet-context';
import { openWalletTrip } from '../data/wallet-trip';
import {
  pickPolicy,
  useInsurancePolicies,
  type InsurancePolicy,
} from '../insurance/insurance-data';
import { bannerOf } from './banner';

export interface WalletScreenData {
  readonly context: WalletContext;
  readonly wallet: Wallet;
  readonly state: 'loading' | 'empty' | 'ready';
  /** The bookings in deck order, the open one last; null when there are none. */
  readonly closed: readonly WalletBooking[];
  readonly open: WalletBooking | null;
  readonly banner: ReturnType<typeof bannerOf>;
  readonly insurance: { readonly loaded: boolean; readonly policy: InsurancePolicy | null };
  readonly pick: (id: string) => void;
}

export function useWalletScreen(): WalletScreenData {
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  useLayoutEffect(() => {
    if (typeof tripId === 'string' && tripId !== '') openWalletTrip(tripId);
  }, [tripId]);
  const context = useWalletContext();
  const services = useBookingsServices();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  const candidates = useLiveRows<CandidateRow>(
    CANDIDATES_SQL,
    context.uid === null ? null : [context.uid, context.crewId ?? '', context.trip?.id ?? ''],
    CANDIDATES_TABLES,
  );
  const insurance = useInsurancePolicies();
  const [picked, setPicked] = useState<string | null>(null);
  const names = useMemo(
    () => new Map(context.members.map((member) => [member.userId, member.name])),
    [context.members],
  );
  const selected = picked ?? soonestRelevant(wallet.upcoming, services.now());
  const { closed, open } = stackOrder(wallet.upcoming, selected);
  const loading = context.status === 'loading' || (context.status === 'ready' && !wallet.loaded);
  return {
    context,
    wallet,
    state: loading ? 'loading' : wallet.upcoming.length === 0 ? 'empty' : 'ready',
    closed,
    open,
    banner: bannerOf(candidates.rows, context.uid, names),
    insurance: {
      loaded: insurance.loaded,
      policy: pickPolicy(insurance.policies, context.trip?.id ?? null),
    },
    pick: setPicked,
  };
}
