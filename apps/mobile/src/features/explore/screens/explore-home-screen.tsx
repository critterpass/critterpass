/**
 * Explore's front page: the destinations with a guide from the synced catalogue, which of them the
 * viewer saved, and which have their offline pack on this phone (looked at again each time the
 * page comes back into view, so a download made on another page shows).
 */
import { tokens } from '@cp/design-tokens';
import { router, useIsFocused } from 'expo-router';
import { useMemo, type ComponentType } from 'react';

import { useSyncPhase } from '@/data/status/use-sync-status';
import { goBackOr } from '@/lib/navigation/back';

import { useOfflinePackFiles } from '../data/use-offline-pack';
import { destinationCards } from '../home-model';
import { useGuideDestinations } from '../queries';
import { exploreRoutes } from '../routes';
import { useSaved } from '../saved-queries';
import type { DestinationCard } from '../home-model';

export function ExploreHomeScreen({
  View,
}: {
  /** The drawing of Explore's front page. */
  readonly View: ComponentType<ExploreHomeViewProps>;
}) {
  const destinations = useGuideDestinations();
  const saved = useSaved();
  const focused = useIsFocused();
  const packFiles = useOfflinePackFiles(focused);
  const syncPhase = useSyncPhase();
  const cards = useMemo(
    () =>
      destinationCards(
        destinations.rows,
        tokens.guide.order,
        new Set(saved.rows.map((row) => row.refId)),
        packFiles,
      ),
    [destinations.rows, saved.rows, packFiles],
  );
  const search = exploreRoutes.search();
  return (
    <View
      cards={cards}
      loading={!destinations.loaded}
      offline={syncPhase === 'offline'}
      savedCount={saved.rows.length}
      onBack={() => goBackOr()}
      onOpen={(card) => router.push(exploreRoutes.destination(card.id))}
      onSaved={() => router.push(exploreRoutes.saved())}
      onSearch={search === undefined ? undefined : () => router.push(search)}
    />
  );
}

export interface ExploreHomeViewProps {
  readonly cards: readonly DestinationCard[];
  /** The catalogue has not reached this phone yet. */
  readonly loading: boolean;
  readonly offline: boolean;
  readonly savedCount: number;
  readonly onBack: () => void;
  readonly onOpen: (card: DestinationCard) => void;
  readonly onSaved: () => void;
  /** Opens the search for any place; absent while that screen is not in the app. */
  readonly onSearch?: (() => void) | undefined;
}
