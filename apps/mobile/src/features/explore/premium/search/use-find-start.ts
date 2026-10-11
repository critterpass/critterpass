/**
 * What the empty Find (4.30) offers besides the copied link: the next free window with the guide's
 * ideas for it, the open (or a new) swipe session, the day trips of the stop the free day is in,
 * and the crews' published plans for the destination. Read from the same hooks Explore in a trip
 * uses; the swipe tile never joins the session's presence, so nobody shows as swiping by looking.
 */
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';

import { useTripAreas } from '@/data/areas/use-trip-areas';
import { useSyncPhase } from '@/data/status/use-sync-status';

import { communityRoutes } from '../../../community/routes';
import { dayTripsSection } from '../../day-trips/day-trips-model';
import { exploreRoutes } from '../../routes';
import * as copy from '../../trip-explore/copy';
import { tripExploreLinks } from '../../trip-explore/links';
import { useGapIdeas } from '../../trip-explore/use-gap-ideas';
import { useNextGap } from '../../trip-explore/use-next-gap';
import { useSwipeEntry } from '../../trip-explore/use-swipe-entry';
import { dayTripsRoute } from '../day-trips/day-trips-route';

export interface FindGap {
  /** "Wed 16:00–19:00". */
  readonly when: string;
  /** "Four of you are free while the spa runs". */
  readonly who: string;
  readonly chips: readonly {
    readonly key: string;
    readonly label: string;
    readonly onPress: () => void;
  }[];
  /** No idea came back: the card opens the gap filler instead. */
  readonly onFill: (() => void) | undefined;
}

const go = (href: Href | undefined) => (href === undefined ? undefined : () => router.push(href));

export function useFindStart(tripId: string, destinationId: string | null) {
  const online = useSyncPhase() !== 'offline';
  const next = useNextGap(tripId);
  const planGap = next.gap;
  const window = useMemo(
    () =>
      planGap === null
        ? null
        : { dayId: planGap.gap.day_id, from: planGap.gap.from, to: planGap.gap.to },
    [planGap],
  );
  const ideas = useGapIdeas(tripId, window, online);
  const swipe = useSwipeEntry(tripId);
  const areas = useTripAreas(tripId);
  const dayTrips = useMemo(
    () => dayTripsSection(areas, planGap?.gap.day_no ?? 1),
    [areas, planGap?.gap.day_no],
  );
  const solo = next.loaded && next.people <= 1;

  const gap: FindGap | null =
    planGap === null
      ? null
      : {
          when: copy.gapWhen(planGap.date, planGap.gap.from, planGap.gap.to),
          who: copy.gapWho(
            planGap.gap.who_free.length,
            planGap.gap.busy.length === 0,
            planGap.busyName,
          ),
          chips: ideas.flatMap((idea) => {
            const [first, second] = idea.places;
            if (idea.kind === 'stay' || first === undefined) return [];
            const href = exploreRoutes.place(first.id, {
              destinationId: destinationId ?? undefined,
              tripId,
            });
            return [
              {
                key: idea.key,
                label: second === undefined ? first.name : copy.pairIdea(first.name, second.name),
                onPress: () => router.push(href),
              },
            ];
          }),
          onFill: go(
            solo
              ? tripExploreLinks.daySearch(tripId, planGap.gap.day_id)
              : tripExploreLinks.fillGap(tripId, {
                  dayId: planGap.gap.day_id,
                  dayNo: planGap.gap.day_no,
                  from: planGap.gap.from,
                  to: planGap.gap.to,
                }),
          ),
        };

  return {
    gap,
    swipe: {
      deckSize: swipe.deckSize,
      open: swipe.live.kind === 'join',
      onPress: () => router.push(exploreRoutes.swipe(tripId)),
    },
    dayTrips:
      dayTrips === null
        ? null
        : {
            names: dayTrips.cards.map((card) => card.name),
            onPress: () => router.push(dayTripsRoute(tripId)),
          },
    crewPlans:
      destinationId === null
        ? null
        : { onPress: () => router.push(communityRoutes.browse(destinationId, tripId)) },
  };
}
