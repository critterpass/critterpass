/**
 * The planning place page (7e-1, 7e-2) with `planning.redesign` on: the place from the device (so
 * a saved destination's places open offline), and inside a trip when it fits, its fact tiles,
 * what is nearby and similar and where the crew stands, from the api. ADD opens Add to plan at the
 * slot it names once that screen is in the app, and adds there directly until then.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids, route params and wire values, never copy. */
import { buildLink, LINK_ENVIRONMENT_CONFIG, toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Share } from 'react-native';

import { currentAppEnvironment } from '@/data/app-session/endpoints';
import { heroAt, useSubjectMedia } from '@/data/media/use-subject-media';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { dataOf } from '@/data/travel-data/freshness';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { useExploreStream } from '../data/use-explore-stream';
import { usePlaceLive } from '../data/use-place-live';
import { guideFor, poiSubject } from '../format';
import { useAddToDay } from '../hooks/use-add-to-day';
import { useSavedPlace } from '../hooks/use-saved-place';
import { liveFacts } from '../place-live';
import { useTripCrew, useTripFacts, type PoiRow } from '../place-queries';
import { exploreRoutes } from '../routes';
import { usePlaceDetailContext } from './context';
import { PlaceFurther } from './further';
import {
  ctaLabel,
  detailCta,
  fitSentence,
  fromStayLabel,
  savedByLabel,
  splitCountLabel,
} from './model';
import { PlaceDetailView } from './place-detail-view';
import { useIdeaSave } from './use-idea-save';

export interface PlaceDetailScreenProps {
  readonly placeId: string;
  readonly row: PoiRow;
  readonly tripId: string | null;
  readonly onBack: () => void;
}

function parseJson(text: string | null | undefined): Record<string, unknown> | null {
  if (text === null || text === undefined) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function PlaceDetailScreen({ placeId, row, tripId, onBack }: PlaceDetailScreenProps) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const facts = useTripFacts(tripId, placeId);
  useExploreStream(row.destination_id);
  const offline = useSyncStatus().phase === 'offline';
  const crew = useTripCrew(tripId);
  const plan = useTripPlan(tripId);
  const read = usePlaceDetailContext(placeId, tripId);
  const context = dataOf(read) ?? null;
  const tz = facts.tz ?? row.timezone ?? row.destination_tz ?? 'UTC';
  const guide = guideFor(row.guide_slug);
  const editorial = useMemo(() => parseJson(row.editorial), [row.editorial]);
  const own = useSavedPlace(tripId === null ? placeId : null, 'poi', row.name);
  const idea = useIdeaSave(tripId, placeId);
  const heart = tripId === null ? own : idea;
  const photo = heroAt(useSubjectMedia(poiSubject(placeId)).items);
  const live = liveFacts(usePlaceLive(placeId), {
    hours: parseJson(row.hours),
    priceLevel: row.price_level,
    hasPhoto: photo !== null,
  });
  const nameOf = (uid: string) => crew.find((member) => member.uid === uid);
  const best = context?.fits?.best ?? null;
  const adding = useAddToDay({
    context,
    place: { poiId: placeId, category: row.category, tz, name: row.name },
    crew: useMemo(() => crew.map((member) => member.uid), [crew]),
    slot:
      best === null
        ? null
        : {
            day_no: best.day_no,
            date: best.date,
            starts_at: best.starts_at,
            ends_at: best.ends_at,
            reason: 'free_gap',
          },
  });
  const cta = detailCta({
    context,
    status: read.status === 'loading' ? 'loading' : offline ? 'offline' : 'ready',
    tz,
    locale,
    addedDay: adding.addedDay,
  });

  const savers = (context?.crew.saved_by ?? []).flatMap((uid) => {
    const member = nameOf(uid);
    return member === undefined
      ? []
      : [{ key: member.uid, name: member.name, joinIndex: member.joinIndex }];
  });
  const firstNames = savers.map((member) => member.name.split(' ')[0] ?? member.name);
  const stances = context?.stances ?? null;
  const split =
    stances === null || !stances.split
      ? null
      : {
          label: splitCountLabel(stances.want.length, stances.ratherNot.length),
          onPress: (() => {
            const href =
              tripId === null || crew.length < 3 ? undefined : hrefFor('7e-3', { tripId, placeId });
            return href === undefined ? undefined : () => router.push(href);
          })(),
        };
  const stay = context?.fromStay ?? null;
  const meta = [
    row.destination_name,
    stay === null ? null : fromStayLabel(stay.minutes, stay.name),
  ].filter((part): part is string => part !== null && part !== '');
  const bestTime = typeof editorial?.['best_time'] === 'string' ? editorial['best_time'] : null;
  const fitNote =
    tripId === null
      ? bestTime
      : context !== null && best === null && context.facts?.hoursKnown === false
        ? t({
            id: 'explore.detail.hoursUnknown',
            message: "Its hours aren't known, so I can't fit it yet.",
          })
        : null;
  const stopName = (stableId: string) => {
    const item = plan.itemRows.find((entry) => entry.stable_id === stableId);
    return item?.poi_id ? (plan.places.get(item.poi_id) ?? null) : null;
  };
  const pick = (params: Record<string, string>) =>
    tripId === null ? undefined : hrefFor('7f-1', { tripId, placeId, ...params });
  const otherDays = pick({ pick: 'day' });

  const press = () => {
    if (cta.kind === 'add') {
      const href = pick({ dayId: cta.day.day_id, start: cta.day.start });
      if (href !== undefined) return router.push(href);
      return adding.add();
    }
    if (cta.kind === 'inPlan' && tripId !== null) {
      const href =
        hrefFor('7b-1', { tripId, day: String(cta.dayNo) }) ?? exploreRoutes.plan(tripId);
      if (href !== undefined) router.push(href);
      return undefined;
    }
    if (tripId === null && row.destination_slug !== null) {
      router.push(exploreRoutes.destination(row.destination_slug));
    }
    return undefined;
  };
  const share = () => {
    const slug = row.destination_slug;
    const link =
      slug === null
        ? null
        : buildLink(
            { kind: 'guide', slug },
            { host: LINK_ENVIRONMENT_CONFIG[currentAppEnvironment()].primaryHost },
          );
    const text = row.destination_name
      ? t({
          id: 'explore.detail.shareText',
          message: `${row.name}, ${row.destination_name}. Worth a look?`,
        })
      : row.name;
    void Share.share(
      link === null ? { message: text } : { message: `${text} ${link}`, url: link },
    ).catch(() => undefined);
  };
  const chatHref = exploreRoutes.guideChat(tripId);
  const today = toLocalWallTime(new Date(), tz).date;

  return (
    <PlaceDetailView
      name={row.name}
      category={row.category}
      guide={guide}
      photo={photo}
      heroUrl={live.heroUrl}
      saved={heart.saved}
      offline={offline}
      onBack={onBack}
      onShare={share}
      onToggleSave={heart.toggle}
      savedBy={firstNames.length === 0 ? null : savedByLabel(firstNames)}
      split={split}
      meta={meta}
      facts={context?.facts ?? null}
      fits={
        best === null
          ? null
          : {
              best,
              sentence: fitSentence(context?.fits ?? null, { locale, stopName }),
              bars: context?.fits?.bars ?? null,
              onOtherDays: otherDays === undefined ? undefined : () => router.push(otherDays),
            }
      }
      fitNote={fitNote}
      crew={
        tripId === null ? null : { keen: savers, qna: context?.qna?.text ?? null, savers: true }
      }
      further={
        <PlaceFurther
          guide={guide}
          context={context}
          tip={context?.tip ?? null}
          live={live.details}
          offers={(() => {
            const href = exploreRoutes.offers({
              tripId,
              name: row.name,
              date: best?.date ?? today,
            });
            return href === undefined
              ? null
              : { placeName: row.name, offline, onOpen: () => router.push(href) };
          })()}
          onPlace={(poiId) =>
            router.push(exploreRoutes.place(poiId, { tripId: tripId ?? undefined }))
          }
          addPlace={(poiId) => pick({ placeId: poiId })}
        />
      }
      cta={{
        label:
          tripId === null
            ? t({ id: 'explore.detail.planTrip', message: 'Plan a trip here' })
            : ctaLabel(cta),
        tone: cta.kind === 'inPlan' ? 'green' : 'yellow',
        disabled: tripId !== null && cta.kind !== 'add' && cta.kind !== 'inPlan',
        busy: adding.busy || (tripId !== null && cta.kind === 'loading'),
        onPress: press,
      }}
      onChat={chatHref === undefined ? undefined : () => router.push(chatHref)}
    />
  );
}
