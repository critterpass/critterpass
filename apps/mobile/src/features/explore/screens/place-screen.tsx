/**
 * A place's page: the place, its guide and the guide's tip from the device (so a saved
 * destination's places open offline), crowds by the hour for the day in question, and, inside a
 * trip, the crew's context and ADD TO DAY from the api. Partner offers are opened on their own
 * screen and never read here.
 */
import { buildLink, LINK_ENVIRONMENT_CONFIG, toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Share } from 'react-native';

import { currentAppEnvironment } from '@/data/app-session/endpoints';
import { heroAt, useSubjectMedia } from '@/data/media/use-subject-media';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { dataOf } from '@/data/travel-data/freshness';
import { useCrowds } from '@/data/travel-data/useCrowds';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Scaffold } from '@/ui/surface/Scaffold';

import type { AddToDayButtonProps } from '../components/add-to-day-button';
import type { CrowdChartProps } from '../components/crowd-chart';
import { PlaceView } from '../components/place-view';
import { guideWritten } from '../data/guide-text';
import { useExploreStream } from '../data/use-explore-stream';
import { usePlaceContext } from '../data/use-place-context';
import { guideFor, poiSubject } from '../format';
import { useAddToDay } from '../hooks/use-add-to-day';
import { useSavedPlace } from '../hooks/use-saved-place';
import { placeMeta, placeTags } from '../place-copy';
import { addState, closedOn, crowdColumns, goAdvice, openState, windowHours } from '../place-model';
import { usePlaceTip, usePoi, useTripCrew, useTripFacts } from '../place-queries';
import { exploreRoutes } from '../routes';

export interface PlaceScreenProps {
  readonly placeId: string;
  /** The destination the place was opened from, so its places sync before the row is known. */
  readonly destinationId?: string | undefined;
  readonly tripId?: string | undefined;
}

function parseJson(text: string | null | undefined): unknown {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function PlaceScreen({ placeId, destinationId, tripId }: PlaceScreenProps) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const trip = tripId ?? null;
  const { row, loaded } = usePoi(placeId);
  const facts = useTripFacts(trip, placeId);
  useExploreStream(row?.destination_id ?? destinationId ?? facts.destinationId);
  const sync = useSyncStatus();
  const offline = sync.phase === 'offline';
  const crew = useTripCrew(trip);
  const tip = usePlaceTip(row === null ? null : placeId, locale);
  const contextRead = usePlaceContext(row === null ? null : placeId, trip);
  const context = dataOf(contextRead) ?? null;

  const tz = facts.tz ?? row?.timezone ?? row?.destination_tz ?? null;
  const now = useMemo(() => new Date(), []);
  const today = toLocalWallTime(now, tz ?? 'UTC');
  const date = context?.crowd?.date ?? context?.suggested_slot?.date ?? today.date;
  const crowds = dataOf(useCrowds({ poiId: row === null ? null : placeId, date }));
  const hours = useMemo(() => parseJson(row?.hours), [row?.hours]);
  const editorial = useMemo(
    () => parseJson(row?.editorial) as { why_go?: unknown; must_see?: unknown } | null,
    [row?.editorial],
  );

  const name = row?.name ?? '';
  const guide = guideFor(row?.guide_slug);
  const { saved, toggle } = useSavedPlace(row === null ? null : placeId, 'poi', name);
  const photo = heroAt(useSubjectMedia(row === null ? null : poiSubject(placeId)).items);
  const adding = useAddToDay({
    context,
    place:
      row === null || tz === null ? null : { poiId: placeId, category: row.category, tz, name },
    crew: useMemo(() => crew.map((member) => member.uid), [crew]),
  });

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (row === null) {
    return (
      <Scaffold testID={loaded ? 'explore-place-missing' : 'explore-place-waiting'}>
        <BackEyebrow
          label={t({ id: 'explore.hero.back', message: 'Explore' })}
          onPress={back}
          testID="explore-back"
        />
        {loaded ? (
          <EmptyState
            guide="tokek"
            guideName={guideFor(null).name}
            title={t({ id: 'explore.place.missingTitle', message: "This place hasn't loaded yet" })}
            line={
              offline
                ? t({
                    id: 'explore.place.missingOffline',
                    message: "I need a connection the first time. After that it's here offline.",
                  })
                : t({
                    id: 'explore.place.missingLine',
                    message: 'Give it a moment, or open it again from its destination.',
                  })
            }
          />
        ) : null}
      </Scaffold>
    );
  }

  const columns = crowdColumns(crowds?.hourly);
  const window = context?.crowd?.best_window ?? crowds?.best_window ?? null;
  const crowd: CrowdChartProps = closedOn(hours, date)
    ? { kind: 'closed', date }
    : columns.length === 0
      ? { kind: 'none', date }
      : {
          kind: 'chart',
          date,
          columns,
          advice: goAdvice(window),
          quietHours: windowHours(window),
          markedHour:
            date === today.date
              ? Number(today.time.slice(0, 2))
              : window === null
                ? null
                : Number(window.start.slice(0, 2)),
        };

  const keenIds = new Set([...(context?.crew.saved_by ?? []), ...(context?.crew.yes_by ?? [])]);
  const keen = crew
    .filter((member) => keenIds.has(member.uid))
    .map((member) => ({ key: member.uid, name: member.name, joinIndex: member.joinIndex }));

  const plan = trip === null ? undefined : exploreRoutes.plan(trip);
  const action: AddToDayButtonProps =
    trip === null
      ? { kind: 'save', saved, onToggleSave: toggle }
      : {
          kind: 'trip',
          state: addState(context, tz, adding.addedDay),
          proposed: adding.proposed,
          busy: contextRead.status === 'loading' || adding.busy,
          offline: contextRead.status === 'missing' && contextRead.reason === 'offline',
          onAdd: adding.add,
          onOpenPlan: plan === undefined ? undefined : () => router.push(plan),
        };

  const offersHref = exploreRoutes.offers({ tripId: trip, name, date });
  const chatHref = exploreRoutes.guideChat(trip);
  const share = () => {
    const slug = row.destination_slug;
    const link =
      slug === null
        ? null
        : buildLink(
            { kind: 'guide', slug },
            { host: LINK_ENVIRONMENT_CONFIG[currentAppEnvironment()].primaryHost },
          );
    const where = row.destination_name ?? '';
    const text =
      where === ''
        ? name
        : t({ id: 'explore.place.shareText', message: `${name}, ${where}. Worth a look?` });
    void Share.share(
      link === null ? { message: text } : { message: `${text} ${link}`, url: link },
    ).catch(() => undefined);
  };

  const destinationRef = row.destination_id;
  const whyGo = typeof editorial?.why_go === 'string' ? editorial.why_go : null;
  return (
    <PlaceView
      name={name}
      category={row.category}
      guide={guide}
      photo={photo}
      tags={placeTags({
        guideName: guide.name,
        guidePick: editorial?.must_see === true,
        mustDoOwner: facts.mustDoOwner,
      })}
      meta={placeMeta({
        category: row.category,
        priceLevel: row.price_level,
        open: openState(hours, tz, now),
        stayMinutes: context?.stay?.minutes ?? null,
      })}
      offline={offline}
      saved={saved}
      onBack={back}
      onShare={share}
      onToggleSave={toggle}
      crowd={crowd}
      tip={guideWritten(tip ?? whyGo, locale)}
      crew={trip === null ? null : { keen, qna: context?.qna?.text ?? null }}
      offers={
        offersHref === undefined
          ? null
          : { placeName: name, offline, onOpen: () => router.push(offersHref) }
      }
      action={action}
      onMap={
        destinationRef === null
          ? undefined
          : () => router.push(exploreRoutes.map(destinationRef, { tripId, placeId }))
      }
      onChat={chatHref === undefined ? undefined : () => router.push(chatHref)}
    />
  );
}
