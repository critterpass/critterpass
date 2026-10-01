/**
 * The Help hub (3k-6) over the trip under way (or the one asked for). Opening it asks once whether
 * to share where the traveller is with the crew for an hour (off until they turn it on); after
 * that, opening Help shares when they said yes and offers a one-tap share when they said no.
 */
import { generateUuidV7, HELP_SHARE_MAX_AHEAD_MIN, type HelpProblem } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';
import { SET_CONSENT } from '@/lib/location/visits';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { usePermission } from '@/lib/permissions';
import { toast } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { BOOKINGS_ROUTES, pickPolicy, useInsurancePolicies } from '@/features/bookings';

import {
  extendHelpShareCommand,
  GETTING_AROUND_SCREEN,
  HELP_SHARE_CONSENT,
  HELP_SHARE_CONSENT_COPY_VERSION,
  startHelpShareCommand,
  stopHelpShareCommand,
} from '../commands';
import { deviceHelpApi } from '../data/help-api';
import { useSpeech } from '../data/use-speech';
import { telUrl } from '../format';
import { safetyRoutes } from '../routes';
import { ConsentSheet } from './consent-sheet';
import { HelpView } from './help-view';
import { ShowIt } from './show-it';
import { onOpen, pendingShare, shareView, type PendingShare } from './share-policy';
import { useHelpHub } from './use-help-hub';
import { useNow } from './use-now';

const GUIDE_IDS = Object.keys(GUIDE_STICKERS);

export function HelpScreen() {
  const { t } = useLingui();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const asked = typeof params.tripId === 'string' && params.tripId !== '' ? params.tripId : null;
  const hub = useHelpHub(deviceHelpApi, asked);
  useTripStreams(hub.tripId);
  const now = useNow(30_000);
  const location = usePermission('location').report;
  const locationDenied = location?.status === 'denied' || location?.status === 'blocked';
  const insurance = useInsurancePolicies();
  const insurer = pickPolicy(insurance.policies, hub.tripId)?.provider ?? null;

  const start = useCommand(startHelpShareCommand);
  const stop = useCommand(stopHelpShareCommand);
  const extend = useCommand(extendHelpShareCommand);
  const consent = useCommand({ ...SET_CONSENT });
  const [pending, setPending] = useState<PendingShare | null>(null);
  const [answered, setAnswered] = useState(false);
  const [showIt, setShowIt] = useState(false);
  const opened = useRef(false);

  const share = shareView(hub.shares, pending, now);
  // The first Help open asks (nothing is shared until the answer); an answer holds before its row syncs.
  const asking =
    !answered && hub.consentLoaded && hub.tripId !== null && onOpen(hub.consent) === 'ask';
  const crewName = hub.trip?.crew_name ?? '';
  const guideSlug = hub.trip?.guide_slug ?? 'tokek';
  const guide = GUIDE_IDS.includes(guideSlug)
    ? GUIDE_STICKERS[guideSlug as keyof typeof GUIDE_STICKERS]
    : GUIDE_STICKERS.tokek;
  const guideName = hub.trip?.guide_name ?? guide.name;
  const phrase = hub.model.phrase;
  const speech = useSpeech(phrase?.text ?? null, phrase?.language ?? null);

  function shared(sessionId: string, result: SendResult) {
    if (result.kind === 'applied' || result.kind === 'queued') {
      setPending(pendingShare(sessionId, Date.now()));
    }
    const overrode =
      result.kind === 'applied' &&
      (result.result as { overrode_pause?: boolean } | null)?.overrode_pause === true;
    if (!overrode) return;
    toast.show({
      id: 'help-share-override',
      title: t({ id: 'safety.share.override', message: 'Sharing anyway, for Help' }),
      subtitle: t({
        id: 'safety.share.overrideLine',
        message: 'Your crew map share stays paused; this one stops in an hour.',
      }),
    });
  }

  function startShare() {
    const tripId = hub.tripId;
    if (tripId === null || locationDenied) return;
    const sessionId = generateUuidV7();
    const label = hub.model.placeLabel;
    void start
      .send({
        trip_id: tripId,
        reason: 'help',
        session_id: sessionId,
        ...(label === null ? {} : { place_label: label.slice(0, 120) }),
      })
      .then((result) => shared(sessionId, result));
  }

  // The first opening of Help (per screen) does what the consent says, once it has loaded.
  useEffect(() => {
    if (opened.current || !hub.consentLoaded || hub.tripId === null) return;
    opened.current = true;
    if (onOpen(hub.consent) === 'share' && share === null) startShare();
    // Runs once per screen when the consent and trip are known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub.consentLoaded, hub.tripId]);

  function answer(granted: boolean) {
    setAnswered(true);
    void consent.send({
      purpose: HELP_SHARE_CONSENT,
      granted,
      copy_version: HELP_SHARE_CONSENT_COPY_VERSION,
    });
    if (granted) startShare();
  }

  function call(number: string) {
    void Linking.openURL(telUrl(number));
    if (share !== null) {
      toast.show({
        id: 'help-calling',
        title: t({
          id: 'safety.help.calling',
          message: `Calling ${number}. Your location is going to the crew.`,
        }),
      });
    }
  }

  const tripId = hub.tripId;
  const capped =
    share === null || share.endsAt + 60 * 60_000 > now + HELP_SHARE_MAX_AHEAD_MIN * 60_000;
  return (
    <>
      <HelpView
        hero={{
          guideName,
          guideSticker: guide,
          placeLabel: hub.model.placeLabel,
          shareHours: share === null ? null : Math.max(1, Math.ceil(share.minutesLeft / 60)),
          onBack: () => (router.canGoBack() ? router.back() : router.replace('/')),
        }}
        model={hub.model}
        share={{
          crewName,
          share,
          locationDenied,
          extendCapped: capped,
          busy: start.pending || stop.pending || extend.pending,
          onStart: () => startShare(),
          onStop: () => {
            if (share?.shareId == null) return;
            setPending(null);
            void stop.send({ share_id: share.shareId });
          },
          onExtend: () => {
            if (share?.shareId == null) return;
            void extend.send({ share_id: share.shareId });
          },
          onSettings: () => void Linking.openSettings(),
        }}
        insurer={
          insurer === null
            ? null
            : t({
                id: 'safety.help.insurer',
                message: `Insurance: ${insurer} · the policy card is in Bookings`,
              })
        }
        playing={speech.speaking}
        onCall={call}
        onProblem={(problem: HelpProblem) => {
          if (tripId !== null) router.push(safetyRoutes.checklist(tripId, problem));
        }}
        onGo={(facility) => {
          const href = hrefFor(GETTING_AROUND_SCREEN, {
            ...(tripId === null ? {} : { tripId }),
            to: `${facility.lat},${facility.lng}`,
          });
          if (href !== undefined) router.push(href);
        }}
        onPlay={speech.speak}
        onShowPhrase={() => setShowIt(true)}
        onSos={tripId === null ? null : () => router.push(safetyRoutes.send(tripId))}
        onInsurance={() => router.push(BOOKINGS_ROUTES.insurance)}
      />
      {asking ? <ConsentSheet crewName={crewName} onAnswer={answer} /> : null}
      {showIt && phrase !== null ? (
        <ShowIt
          phrase={phrase.text}
          lang={phrase.language}
          gloss={phrase.gloss}
          onClose={() => setShowIt(false)}
        />
      ) : null}
    </>
  );
}
