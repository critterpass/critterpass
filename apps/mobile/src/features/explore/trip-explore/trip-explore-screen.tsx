/**
 * Explore in a trip (7g-1): the trip's destination with what fills the plan's next free window, the
 * guide's picks with where each stands for the crew, and the way into swiping together. The plan,
 * Ideas and the picks' states read from synced rows; the picks come from the destination's guide
 * read (kept for offline) and the gap ideas from the api while online.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useMemo } from 'react';

import { useTripAreas } from '@/data/areas/use-trip-areas';
import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { useReadsLocalNames } from '@/data/places/use-shown-names';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { heroAt, useDestinationMedia, useSubjectMedia } from '@/data/media/use-subject-media';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { dataOf } from '@/data/travel-data/freshness';

import { useExploreDestination } from '../data/use-explore-destination';
import { useLiveRows } from '../data/live-rows';
import { guideFor, poiSubject } from '../format';
import { guideTagline } from '../guide-copy';
import { useSponsoredEvents } from '../hooks/use-sponsored-events';
import { usePlannedPlaces } from '../map-queries';
import { coverMedia, pickPhoto } from '../profile-photo';
import { categoryIcon } from '../category';
import { dayTripsSection } from '../day-trips/day-trips-model';
import { dayTripLinks } from '../day-trips/links';
import { groupLabel } from '../places/places-copy';
import { CATEGORY_GROUPS, categoryGroupOf } from '../places/places-model';
import { useDestinationRow, useLocalPicks, usePlaceKindCounts } from '../queries';
import { exploreRoutes } from '../routes';
import { pickEntries, picksOrLocal, PICKS_SHOWN } from '../sponsored-model';
import * as copy from './copy';
import { tripExploreLinks } from './links';
import type { GapsCardState } from './gaps-card';
import { TripExploreView, type TripPick } from './trip-explore-view';
import { kindCounts, pickState } from './trip-explore-model';
import { useGapIdeas } from './use-gap-ideas';
import { useNextGap } from './use-next-gap';
import { usePickSave } from './use-pick-save';
import { useSwipeEntry } from './use-swipe-entry';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
const TRIP_SQL = `SELECT t.destination_id, (SELECT g.slug FROM guides g WHERE g.id = t.guide_id) AS guide_slug
  FROM trips t WHERE t.id = ?`;
const PLACES_SQL = `SELECT count(*) AS n FROM pois WHERE destination_id = ? AND merged_into_id IS NULL`;
/** Local picks read beyond the row's length, so places already in the plan can be left out. */
const LOCAL_PICKS_READ = PICKS_SHOWN * 4;
/* eslint-enable lingui/no-unlocalized-strings */

const go = (href: Href | undefined) => (href === undefined ? undefined : () => router.push(href));

export function TripExploreScreen({ tripId }: { readonly tripId: string }) {
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const trip = useLiveRows<{ destination_id: string | null; guide_slug: string | null }>(
    TRIP_SQL,
    [tripId],
    ['trips', 'guides'],
  ).rows[0];
  const destinationId = trip?.destination_id ?? null;
  const { row } = useDestinationRow(destinationId);
  const base = useExploreDestination({ destination: destinationId, tripId });
  const data = dataOf(base);
  const name = row?.name ?? data?.destination.name ?? '';
  const slug = row?.slug ?? data?.destination.slug ?? null;
  const guide = guideFor(trip?.guide_slug ?? row?.guide_slug);
  // The curated cover; a destination without one shows a pick's photo, credited.
  const photo = heroAt(useDestinationMedia(slug).items) ?? coverMedia(data?.cover);
  const sync = useSyncStatus();
  const online = sync.phase !== 'offline';

  const { ideas } = useTripIdeas(tripId);
  const ideaPlaces = useMemo(
    () => new Set(ideas.flatMap((idea) => (idea.poiId === null ? [] : [idea.poiId]))),
    [ideas],
  );
  const planned = usePlannedPlaces(tripId);
  const next = useNextGap(tripId);
  const gap = next.gap;
  const window = useMemo(
    () => (gap === null ? null : { dayId: gap.gap.day_id, from: gap.gap.from, to: gap.gap.to }),
    [gap],
  );
  const gapIdeas = useGapIdeas(tripId, window, online);
  const swipe = useSwipeEntry(tripId);
  const savePick = usePickSave(tripId);
  const placesCount = useLiveRows<{ n: number }>(
    PLACES_SQL,
    destinationId === null ? null : [destinationId],
    ['pois'],
  ).rows[0]?.n;

  // The guide's picks that are not in the plan yet, topped up from the recommended places on the
  // phone, so the row always has something to tap.
  const localPicks = useLocalPicks(destinationId, LOCAL_PICKS_READ);
  const readsLocal = useReadsLocalNames(destinationId);
  const organic = picksOrLocal(pickEntries(data?.picks ?? [], readsLocal), localPicks, {
    skip: new Set(planned.keys()),
  });
  const kindRows = usePlaceKindCounts(destinationId);
  const kinds = useMemo(
    () =>
      kindCounts(kindRows, categoryGroupOf).map(({ group, count }) => {
        const href = tripExploreLinks.kind(tripId, group);
        return {
          key: group,
          label: groupLabel(group),
          count: format.number(locale, count),
          icon: categoryIcon(CATEGORY_GROUPS[group][0]),
          onPress: href === undefined ? undefined : () => router.push(href),
        };
      }),
    [kindRows, locale, tripId],
  );
  // The day trips of the stop the next free day is in; none leaves the page as it was.
  const areas = useTripAreas(tripId);
  const dayTrips = useMemo(
    () => dayTripsSection(areas, gap?.gap.day_no ?? 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the copy follows the locale.
    [areas, gap?.gap.day_no, locale],
  );
  const solo = next.loaded && next.people <= 1;
  const paid = organic.find((pick) => pick.sponsored !== null)?.sponsored ?? null;
  const sponsoredEvents = useSponsoredEvents(paid?.placementId ?? null, 'picks');
  const pickMedia = useSubjectMedia(
    organic.length === 0 ? null : organic.map((pick) => poiSubject(pick.poiId)).join(','),
  ).items;
  const gapPhotos = usePlaceTilePhotos(
    gapIdeas.flatMap((idea) => idea.places.slice(0, 1).map((place) => place.id)),
  );
  const placeHref = (id: string) =>
    exploreRoutes.place(id, { destinationId: destinationId ?? undefined, tripId });

  const picks: TripPick[] = organic.map((pick) => ({
    id: pick.poiId,
    name: pick.name,
    category: pick.category,
    photo: pickPhoto(
      pick.poiId,
      pickMedia.find((item) => item.subjects.includes(poiSubject(pick.poiId))),
      data?.pick_photos[pick.poiId],
    ),
    sponsored:
      pick.sponsored === null
        ? undefined
        : {
            onWhy: () =>
              router.push(exploreRoutes.whySponsored(pick.sponsored?.partner ?? '', name)),
          },
    state: pickState(pick.poiId, planned, ideaPlaces),
  }));

  const gaps: GapsCardState =
    gap !== null
      ? {
          kind: 'gap',
          when: copy.gapWhen(gap.date, gap.gap.from, gap.gap.to),
          who: copy.gapWho(gap.gap.who_free.length, gap.gap.busy.length === 0, gap.busyName),
          tiles: gapIdeas.map((idea) => {
            const [first, second] = idea.places;
            return {
              key: idea.key,
              label:
                idea.kind === 'stay' || first === undefined
                  ? copy.stayIdea()
                  : second === undefined
                    ? first.name
                    : copy.pairIdea(first.name, second.name),
              photo: first === undefined ? undefined : gapPhotos.get(first.id),
              onPress: first === undefined ? undefined : () => router.push(placeHref(first.id)),
            };
          }),
          // The gap filler plans a window for the crew; one person searches for that day.
          onFill: go(
            solo
              ? tripExploreLinks.daySearch(tripId, gap.gap.day_id)
              : tripExploreLinks.fillGap(tripId, {
                  dayId: gap.gap.day_id,
                  dayNo: gap.gap.day_no,
                  from: gap.gap.from,
                  to: gap.gap.to,
                }),
          ),
        }
      : !next.loaded
        ? { kind: 'loading' }
        : next.hasPlan
          ? { kind: 'full' }
          : { kind: 'empty' };

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(tripExploreLinks.hub(tripId) ?? '/');
  };

  return (
    <TripExploreView
      hero={{
        name,
        guide,
        tagline: guideTagline(guide, name),
        backLabel: copy.backLabel(),
        onBack: back,
        photo,
      }}
      savedCount={ideas.length}
      onSaved={go(tripExploreLinks.ideas(tripId))}
      searchPlaceholder={copy.searchPlaceholder(name, guide.name)}
      onSearch={go(tripExploreLinks.search(tripId))}
      offline={!online}
      gaps={gaps}
      picks={picks}
      placesCount={
        placesCount === undefined || placesCount === 0 ? null : format.number(locale, placesCount)
      }
      onAllPlaces={go(tripExploreLinks.allPlaces(tripId, destinationId))}
      onOpenPick={(pick) => {
        if (pick.sponsored !== undefined) sponsoredEvents.click();
        router.push(placeHref(pick.id));
      }}
      onSavePick={(pick) => savePick({ id: pick.id, name: pick.name })}
      dayTrips={
        dayTrips === null
          ? undefined
          : {
              city: dayTrips.city === '' ? name : dayTrips.city,
              cards: dayTrips.cards,
              onOpen: (card) => router.push(dayTripLinks.area(tripId, card.id)),
            }
      }
      kinds={kinds}
      swipe={
        solo ? undefined : { ...swipe, onPress: () => router.push(exploreRoutes.swipe(tripId)) }
      }
    />
  );
}
