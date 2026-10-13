/**
 * The place page's data and actions (7e-1, 7e-2): the place from
 * the device (so a saved destination's places open offline), and inside a trip when it fits, its
 * fact tiles, what is nearby and similar and where the crew stands, from the api. ADD opens Add to
 * plan (7f-1) at the slot it names.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids, route params and wire values, never copy. */
import { buildLink, LINK_ENVIRONMENT_CONFIG, toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Share } from 'react-native';

import { currentAppEnvironment } from '@/data/app-session/endpoints';
import { heroAt, useSubjectMedia } from '@/data/media/use-subject-media';
import { useSyncPhase } from '@/data/status/use-sync-status';
import type { PlaceProfile } from '@/data/places/place-read';
import { dataOf } from '@/data/travel-data/freshness';
import { goHref } from '@/features/go';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { useExploreStream } from '../data/use-explore-stream';
import { usePlaceLive } from '../data/use-place-live';
import { guideFor, poiSubject } from '../format';
import { useSavedPlace } from '../hooks/use-saved-place';
import { liveFacts } from '../place-live';
import { heroCreditOf } from '../place-lightbox';
import { useTripCrew, useTripFacts, type PoiRow } from '../place-queries';
import { exploreRoutes } from '../routes';
import { usePlaceDetailContext } from './context';
import {
  ctaLabel,
  detailCta,
  fitSentence,
  fromStayLabel,
  savedByLabel,
  splitCountLabel,
} from './model';

import { areaFromAddress, sellsTickets } from './place-facts';
import { useIdeaSave } from './use-idea-save';
import type { PlaceMediaAsset } from '@cp/domain';
import type { ReactNode } from 'react';

import type { GuideFacts } from '../format';
import type { FactTiles } from './context';

import { type StackMember } from '@/ui/people/AvatarStack';
import type { FitBars, FitDayView } from './context';

export interface PlaceDetailInput {
  readonly placeId: string;
  readonly row: PoiRow;
  /** The place's AI-written profile, when the api has one. */
  readonly profile?: PlaceProfile | null | undefined;
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

export function usePlaceDetail({ placeId, row, profile = null, tripId, onBack }: PlaceDetailInput) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const facts = useTripFacts(tripId, placeId);
  useExploreStream(row.destination_id);
  const offline = useSyncPhase() === 'offline';
  const crew = useTripCrew(tripId);
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
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
  // The context could not be read with signal: the day is still hers to choose.
  const unread = context === null && read.status === 'missing' && !offline;
  const found = detailCta({
    context,
    status: read.status === 'loading' ? 'loading' : offline ? 'offline' : 'ready',
    tz,
    locale,
  });
  const cta = unread ? ({ kind: 'noFit' } as const) : found;

  const savers = (context?.crew.saved_by ?? []).flatMap((uid) => {
    const member = nameOf(uid);
    return member === undefined
      ? []
      : [{ key: member.uid, name: member.name, joinIndex: member.joinIndex }];
  });
  const firstNames = savers.map((member) => member.name.split(' ')[0] ?? member.name);
  const stances = context?.stances ?? null;
  // The tag opens Crew can't agree; where that has nothing to open (a crew of two) it is left out.
  const splitHref =
    tripId === null || crew.length < 3 ? undefined : hrefFor('7e-3', { tripId, placeId });
  const split =
    stances === null || !stances.split || splitHref === undefined
      ? null
      : {
          label: splitCountLabel(stances.want.length, stances.ratherNot.length),
          onPress: () => router.push(splitHref),
        };
  const stay = context?.fromStay ?? null;
  const meta = [
    areaFromAddress(row.address, row.destination_name),
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
  const ready = profile?.status === 'ready' ? profile : null;

  // Destination pages are opened by id from Explore's own lists: the same ref finds the open one.
  const planAt = row.destination_id ?? row.destination_slug;
  const press = () => {
    if (cta.kind === 'add') {
      const href = pick({ dayId: cta.day.day_id, start: cta.day.start });
      if (href !== undefined) router.push(href);
      return undefined;
    }
    if (cta.kind === 'inPlan' && tripId !== null) {
      const href =
        hrefFor('7b-1', { tripId, day: String(cta.dayNo) }) ?? exploreRoutes.plan(tripId);
      if (href !== undefined) router.push(href);
      return undefined;
    }
    if (cta.kind === 'noFit' && otherDays !== undefined) {
      router.push(otherDays);
      return undefined;
    }
    // Back to the destination's page when it is underneath, never a second copy over this place.
    if (tripId === null && planAt !== null) router.dismissTo(exploreRoutes.destination(planAt));
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
  const view: Omit<PlaceDetailViewProps, 'further'> = {
    name: row.name,
    category: row.category,
    guide: guide,
    photo: photo,
    heroUrl: live.heroUrl ?? ready?.photos[0]?.url ?? null,
    heroCredit: heroCreditOf(live, ready?.photos ?? []),
    saved: heart.saved,
    offline: offline,
    onBack: onBack,
    onShare: share,
    onToggleSave: heart.toggle,
    savedBy: firstNames.length === 0 ? null : savedByLabel(firstNames),
    split: split,
    meta: meta,
    facts: context?.facts ?? null,
    fits:
      best === null
        ? null
        : {
            best,
            sentence: fitSentence(context?.fits ?? null, { locale, stopName }),
            bars: context?.fits?.bars ?? null,
            planned:
              cta.kind !== 'inPlan'
                ? null
                : {
                    date:
                      plan.dayRows.find((dayRow) => dayRow.day_no === cta.dayNo)?.date ?? best.date,
                    time: cta.time,
                    grade:
                      context?.fits?.days.find((one) => one.day_no === cta.dayNo)?.grade ?? null,
                  },
            onOtherDays: otherDays === undefined ? undefined : () => router.push(otherDays),
          },
    fitNote: fitNote,
    crew: tripId === null ? null : { keen: savers, qna: context?.qna?.text ?? null, savers: true },
    cta: {
      label:
        tripId === null
          ? t({ id: 'explore.detail.planTrip', message: 'Plan a trip here' })
          : ctaLabel(cta),
      tone: cta.kind === 'inPlan' ? 'green' : 'yellow',
      disabled:
        tripId === null
          ? planAt === null
          : cta.kind !== 'add' &&
            cta.kind !== 'inPlan' &&
            !(cta.kind === 'noFit' && otherDays !== undefined),
      busy: tripId !== null && cta.kind === 'loading',
      onPress: press,
    },
    onChat: chatHref === undefined ? undefined : () => router.push(chatHref),
    onGo:
      row.lat === null || row.lng === null
        ? undefined
        : () => router.push(goHref({ kind: 'place', poiId: placeId, tripId })),
  };
  return {
    view,
    further: {
      placeId,
      name: row.name,
      profile: ready,
      organiser: plan.organiser,
      guide,
      context,
      tip: context?.tip ?? null,
      live: live.details,
      offers: (() => {
        const href = exploreRoutes.offers({
          tripId,
          name: row.name,
          date: best?.date ?? today,
        });
        return href === undefined || !sellsTickets(row.category)
          ? null
          : { placeName: row.name, offline, onOpen: () => router.push(href) };
      })(),
      onPlace: (poiId: string) =>
        router.push(exploreRoutes.place(poiId, { tripId: tripId ?? undefined })),
      addPlace: (poiId: string) => pick({ placeId: poiId }),
    },
  };
}

export interface PlaceDetailViewProps {
  readonly name: string;
  readonly category: string;
  readonly guide: GuideFacts;
  readonly photo: PlaceMediaAsset | null;
  readonly heroUrl: string | null;
  readonly heroCredit?: string | undefined;
  readonly saved: boolean;
  readonly offline: boolean;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onToggleSave: () => void;
  /** "SAVED BY ALEX + RIN". */
  readonly savedBy: string | null;
  /** "CREW SPLIT 2–2", opening the split. */
  readonly split: { readonly label: string; readonly onPress: (() => void) | undefined } | null;
  readonly meta: readonly string[];
  readonly facts: FactTiles | null;
  readonly fits: Omit<WhenItFitsProps, 'guide'> | null;
  /** What the page says when there is no fit to show (no trip, hours not known). */
  readonly fitNote: string | null;
  readonly crew: CrewRowProps | null;
  /** 7e-2: the tip, what to know, nearby, similar and the kept live and partner blocks. */
  readonly further: ReactNode;
  readonly cta: {
    readonly label: string;
    readonly tone: 'yellow' | 'green';
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onPress: () => void;
  };
  readonly onChat?: (() => void) | undefined;
  /** GO: the route from here, then directions in the maps app. */
  readonly onGo?: (() => void) | undefined;
}

export interface CrewRowProps {
  /** Crewmates who saved the place or said yes to it, in the crew's own order. */
  readonly keen: readonly StackMember[];
  /** The crew's Q&A line about the place, when the chat has one. */
  readonly qna: string | null;
  /**
   * The faces are who saved it (the planning place page): "Alex and Rin saved it." leads, then
   * the Q&A line.
   */
  readonly savers?: boolean | undefined;
}

export interface WhenItFitsProps {
  readonly guide: GuideFacts;
  readonly best: FitDayView;
  readonly sentence: string | null;
  readonly bars: FitBars | null;
  /**
   * The place is already a stop: the card leads with where it is ("In the plan · Mon 5 at 14:00")
   * and whether it fits there, and the best slot, when it is another, is a second line.
   */
  readonly planned?: {
    readonly date: string;
    readonly time: string | null;
    readonly grade: FitDayView['grade'] | null;
  } | null;
  /** Opens the day picker; absent while Add to plan is not in the app. */
  readonly onOtherDays?: (() => void) | undefined;
}
