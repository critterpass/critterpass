/**
 * Swipe together for a trip: joins the open session (or starts one), shows the deck the guide
 * ranked with each place's own photo, sends each swipe, and stamps a match when enough of the crew
 * said yes. The verdicts this phone gave are kept on the phone; everyone's yes votes and the
 * matches come from the synced trip.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { toast } from '@/motion';

import { SwipeView, type SwipeStage } from '../components/swipe-view';
import { guideFor, noonUtc } from '../format';
import { usePlacePhotos } from '../hooks/use-place-photos';
import { useSwipeSession } from '../hooks/use-swipe-session';
import { usePlannedPlaces } from '../map-queries';
import { useTripCrew } from '../place-queries';
import { socialPill, swipeMeta } from '../swipe-copy';
import { deckState, nextMatch, othersYes, whyLines } from '../swipe-model';

export interface SwipeScreenProps {
  readonly tripId: string;
  /** A session id, or `new` to join the trip's open session or start one. */
  readonly sessionId: string;
}

export function SwipeScreen({ tripId, sessionId }: SwipeScreenProps) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const session = useSwipeSession(tripId, sessionId);
  const crew = useTripCrew(tripId);
  const planned = usePlannedPlaces(tripId);
  const sync = useSyncStatus();
  const [whyOpen, setWhyOpen] = useState(false);
  const [stamped, setStamped] = useState<ReadonlySet<string>>(new Set());
  const { row, deck, places, swiped, matches } = session;
  const photos = usePlacePhotos(deck.map((card) => card.poi_id));

  const inPlan = useMemo(() => new Set(planned.keys()), [planned]);
  const state = useMemo(() => deckState(deck, swiped, inPlan), [deck, swiped, inPlan]);
  const guide = guideFor(row?.guide_slug);
  const nameOf = (poiId: string) => places.get(poiId)?.name ?? '';

  // Matches made before this page opened are history, not news: only new ones get the stamp.
  const [seeded, setSeeded] = useState(false);
  if (!seeded && session.loaded && row !== null) {
    setSeeded(true);
    setStamped(new Set(matches.map((match) => match.id)));
  }
  const match = seeded ? nextMatch(matches, stamped) : null;
  useEffect(() => {
    if (match === null) return;
    const place = places.get(match.poiId)?.name ?? '';
    const day = match.dayNo;
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
      id: `explore-swipe-match-${match.id}`,
      title:
        day === null
          ? t({ id: 'explore.swipe.toastMatch', message: `${place} is a match` })
          : t({ id: 'explore.swipe.toastSuggested', message: `${place} suggested for Day ${day}` }),
    });
  }, [match, places, t]);

  const face = (index: number) => {
    const card = state.remaining[index];
    const place = card === undefined ? undefined : places.get(card.poi_id);
    if (card === undefined || place === undefined) return null;
    const yesNames = othersYes(
      session.yesVotes,
      card.poi_id,
      session.me,
      crew.map((member) => member.uid),
    ).map((uid) => crew.find((member) => member.uid === uid)?.name ?? '');
    return {
      poiId: card.poi_id,
      name: place.name,
      category: place.category,
      meta: swipeMeta(place.category, place.price_level, card.reasons),
      note: card.note,
      social: socialPill(yesNames.filter((name) => name !== '')),
      photo: photos.get(card.poi_id) ?? null,
    };
  };
  const top = face(0);
  const ended = row?.status === 'ended';
  const stage: SwipeStage =
    row === null || (deck.length === 0 && !ended) || (top === null && !state.finished && !ended)
      ? { kind: 'building' }
      : state.finished || ended || top === null
        ? {
            kind: 'summary',
            ended: ended && !state.finished,
            yesCount: Object.values(swiped).filter((verdict) => verdict === 'yes').length,
            matches: matches.map((entry) => ({
              id: entry.id,
              name: nameOf(entry.poiId),
              dayNo: entry.dayNo,
            })),
          }
        : {
            kind: 'deck',
            top,
            under: face(1),
            why: whyLines(state.remaining[0]?.reasons ?? []),
          };

  const dates =
    row === null || row.start_date === null || row.end_date === null
      ? null
      : format.dateInterval(locale, noonUtc(row.start_date), noonUtc(row.end_date), {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
  const where = row?.destination_name ?? t({ id: 'explore.swipe.trip', message: 'Trip' });
  return (
    <SwipeView
      eyebrow={dates === null ? where : `${where} · ${dates}`}
      guide={guide}
      live={crew
        .filter((member) => session.live.some((present) => present.uid === member.uid))
        .map((member) => ({ key: member.uid, name: member.name, joinIndex: member.joinIndex }))}
      done={state.done}
      total={state.total}
      matchCount={matches.length}
      offline={sync.phase === 'offline'}
      stage={stage}
      whyOpen={whyOpen}
      onWhy={setWhyOpen}
      onSwipe={(poiId, verdict) => {
        setWhyOpen(false);
        session.swipe(poiId, verdict);
      }}
      onUndo={session.canUndo ? session.undoLast : undefined}
      match={
        match === null
          ? null
          : {
              placeName: nameOf(match.poiId),
              dayNo: match.dayNo,
              onDone: () => setStamped((current) => new Set(current).add(match.id)),
            }
      }
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
