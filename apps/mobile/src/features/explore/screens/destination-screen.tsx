/**
 * A destination's guide page (a live guide's, or the guest guide's for a place without one): reads
 * the catalogue row and the month curve from the device, the fares, exchange rate and picks from
 * the api (keeping the last good answer for offline), and prices a tapped month for the crew.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

import { EmptyState } from '@/ui/states/EmptyState';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { heroAt, useDestinationMedia, useSubjectMedia } from '@/data/media/use-subject-media';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { dataOf } from '@/data/travel-data/freshness';

import type { ActionsMode } from '../components/destination-actions';
import { DestinationView } from '../components/destination-view';
import type { MonthPrices } from '../components/month-panel';
import { useExploreDestination } from '../data/use-explore-destination';
import { useExploreStream } from '../data/use-explore-stream';
import {
  crowdBand,
  flightFact,
  legendChips,
  monthBars,
  monthKeyFor,
  parseBestMonths,
  priceRows,
} from '../destination-model';
import { guideFor, poiSubject } from '../format';
import { guideTagline, heroChips } from '../guide-copy';
import { useSavedPlace } from '../hooks/use-saved-place';
import { useSoloTrip } from '../hooks/use-solo-trip';
import { useSponsoredEvents } from '../hooks/use-sponsored-events';
import { useDestinationRow, useMyCrews, useNames, useSeasonMonths, useViewer } from '../queries';
import { exploreRoutes } from '../routes';
import { pickEntries } from '../sponsored-model';

export interface DestinationScreenProps {
  /** Destination id or slug. */
  readonly destination: string;
  readonly tripId?: string | undefined;
  readonly crewId?: string | undefined;
}

export function DestinationScreen({ destination, tripId, crewId }: DestinationScreenProps) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const { row } = useDestinationRow(destination);
  const viewer = useViewer();
  const crews = useMyCrews(viewer.uid);
  const sync = useSyncStatus();
  const [month, setMonth] = useState<number | null>(null);
  const [mode, setMode] = useState<ActionsMode>('actions');

  const ref = row?.id ?? destination;
  const base = useExploreDestination({ destination: ref, tripId });
  const priced = useExploreDestination({
    destination: month === null ? null : ref,
    tripId,
    month: month === null ? undefined : monthKeyFor(month, new Date()),
  });
  const data = dataOf(base);
  const id = row?.id ?? data?.destination.id ?? null;
  const slug = row?.slug ?? data?.destination.slug ?? null;
  const name = row?.name ?? data?.destination.name ?? '';
  useExploreStream(id);

  const guide = guideFor(row?.guide_slug, row?.coverage !== 'guest');
  const season = useSeasonMonths(id);
  const bars = useMemo(
    () => monthBars(data?.curve ?? (season.length > 0 ? season : null)),
    [data?.curve, season],
  );
  const { saved, toggle } = useSavedPlace(id, 'place', name);
  const solo = useSoloTrip({ placeId: id, placeName: name, crewId });
  const photo = heroAt(useDestinationMedia(slug).items);

  const organic = useMemo(() => pickEntries(data?.picks ?? []), [data?.picks]);
  const paid = organic.find((pick) => pick.sponsored !== null)?.sponsored ?? null;
  const sponsoredEvents = useSponsoredEvents(paid?.placementId ?? null, 'picks');
  const pickMedia = useSubjectMedia(
    organic.length === 0 ? null : organic.map((pick) => poiSubject(pick.poiId)).join(','),
  ).items;
  const pricedData = dataOf(priced);
  const names = useNames(
    useMemo(
      () => (pricedData?.origins ?? []).flatMap((origin) => origin.user_ids),
      [pricedData?.origins],
    ),
  );

  // While the crew picker or the solo confirm is open, back returns to the actions first.
  useEffect(() => {
    if (mode === 'actions') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setMode('actions');
      return true;
    });
    return () => subscription.remove();
  }, [mode]);

  const chips = heroChips(locale, {
    flight: flightFact(data?.fares ?? [], viewer.homeAirport),
    fx: data?.fx ?? null,
    best: data?.best_months ?? parseBestMonths(row?.best_months),
  });

  const prices: MonthPrices =
    priced.status === 'loading'
      ? { kind: 'loading' }
      : pricedData === undefined
        ? { kind: 'unavailable' }
        : pricedData.home_airport_missing && pricedData.origins.length === 0
          ? { kind: 'noAirport' }
          : pricedData.fares.length === 0 && pricedData.origins.length === 0
            ? { kind: 'unavailable' }
            : {
                kind: 'rows',
                rows: priceRows(pricedData, viewer.uid, names),
                offline: priced.status === 'stale' && priced.reason === 'offline',
              };
  const bar = month === null ? undefined : bars[month - 1];
  const profile = exploreRoutes.profile();
  const crewPlans = id === null ? undefined : exploreRoutes.crewPlans(id);

  const pitchTo = (crew: string) => {
    const href = id === null ? undefined : exploreRoutes.pitch(crew, id);
    if (href !== undefined) router.push(href);
  };
  const back = () => {
    if (mode !== 'actions') setMode('actions');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (name === '' && base.status === 'missing') {
    const guest = guideFor(null);
    return (
      <Scaffold testID="explore-destination-missing">
        <BackEyebrow
          label={t({ id: 'explore.hero.back', message: 'Explore' })}
          onPress={back}
          testID="explore-back"
        />
        <EmptyState
          guide="tokek"
          guideName={guest.name}
          title={
            base.reason === 'not_found'
              ? t({ id: 'explore.missing.title', message: "That place isn't in the guide" })
              : t({ id: 'explore.missing.offlineTitle', message: "This guide hasn't loaded yet" })
          }
          line={
            base.reason === 'not_found'
              ? t({ id: 'explore.missing.line', message: 'Try the search. I cover most places.' })
              : t({
                  id: 'explore.missing.offlineLine',
                  message: "I need a connection the first time. After that I'm here offline.",
                })
          }
        />
      </Scaffold>
    );
  }

  const notice =
    base.status === 'loading' || bars.length > 0 || organic.length > 0
      ? null
      : guide.guest || guide.learning
        ? ('limited' as const)
        : data === undefined
          ? ('unavailable' as const)
          : ('writing' as const);

  return (
    <DestinationView
      notice={notice}
      hero={{
        name,
        guide,
        tagline: guideTagline(guide, name),
        backLabel:
          guide.guest && row?.country
            ? row.country
            : t({ id: 'explore.hero.back', message: 'Explore' }),
        onBack: back,
        saved,
        onToggleSave: toggle,
        chips,
        photo,
      }}
      loading={base.status === 'loading' && bars.length === 0}
      offline={sync.phase === 'offline'}
      months={
        bars.length === 0
          ? null
          : {
              bars,
              legend: legendChips(bars),
              selected: month,
              onSelect: (next) => setMonth((current) => (current === next ? null : next)),
              panel:
                month === null || bar === undefined
                  ? null
                  : {
                      month,
                      crowd: crowdBand(bar.fraction),
                      highlight: bar.highlight,
                      prices,
                      onSetHomeAirport:
                        profile === undefined ? undefined : () => router.push(profile),
                    },
            }
      }
      picks={organic.map((pick) => ({
        id: pick.poiId,
        name: pick.name,
        category: pick.category,
        photo: pickMedia.find((item) => item.subjects.includes(poiSubject(pick.poiId))) ?? null,
        sponsored:
          pick.sponsored === null
            ? undefined
            : {
                onWhy: () =>
                  router.push(exploreRoutes.whySponsored(pick.sponsored?.partner ?? '', name)),
              },
      }))}
      onOpenPick={(pick) => {
        if (pick.sponsored !== undefined) sponsoredEvents.click();
        router.push(exploreRoutes.place(pick.id, { destinationId: id ?? undefined, tripId }));
      }}
      onMap={id === null ? undefined : () => router.push(exploreRoutes.map(id, { tripId }))}
      onCrewPlans={crewPlans === undefined ? undefined : () => router.push(crewPlans)}
      actions={{
        mode,
        placeName: name,
        guideName: guide.name,
        crews,
        soloBusy: solo.busy,
        onPitch: () => {
          if (crewId !== undefined) pitchTo(crewId);
          else if (crews.length === 1 && crews[0] !== undefined) pitchTo(crews[0].id);
          else setMode('crews');
        },
        onPickCrew: pitchTo,
        onSolo: () => setMode('solo'),
        onConfirmSolo: solo.start,
        onCancel: () => setMode('actions'),
      }}
    />
  );
}
