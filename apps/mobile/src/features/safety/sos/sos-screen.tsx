/**
 * An SOS (3k-10), for the crewmate it reached and for its sender. Opening it tells the sender it
 * was seen (once); I'M GOING tells them someone is coming; the sender's I'M OK (or a responder's
 * "is safe") ends it and its location share, and everyone alerted hears the all-clear.
 */
import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { feedback, toast } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';

import { telUrl } from '../format';
import { resolveSosCommand, respondSosCommand, triggerSosCommand } from '../commands';
import { deviceHelpApi } from '../data/help-api';
import { useHelpHub } from '../help/use-help-hub';
import { safetyRoutes } from '../routes';
import { SosView } from './sos-view';
import { senderBubble } from './sos-model';
import { useSos } from './use-sos';

const GUIDE_IDS = Object.keys(GUIDE_STICKERS);

function dial(number: string) {
  void Linking.openURL(telUrl(number));
}

function presetWords(preset: string | null, t: ReturnType<typeof useLingui>['t']): string {
  switch (preset) {
    case 'fell':
      return t({ id: 'safety.preset.fell', message: 'I fell' });
    case 'lost':
      return t({ id: 'safety.preset.lost', message: "I'm lost" });
    case 'need_ride':
      return t({ id: 'safety.preset.ride', message: 'Need a ride' });
    case null:
    default:
      return '';
  }
}

export function SosScreen() {
  const { t } = useLingui();
  const params = useLocalSearchParams<{ id?: string }>();
  const sosId = typeof params.id === 'string' && params.id !== '' ? params.id : null;
  const sos = useSos(sosId);
  const tripId = sos.row?.trip_id ?? null;
  useTripStreams(tripId);
  const hub = useHelpHub(deviceHelpApi, tripId);
  const respond = useCommand(respondSosCommand);
  const resolve = useCommand(resolveSosCommand);
  const trigger = useCommand(triggerSosCommand);
  const acked = useRef(false);
  // 3k-10 is a takeover: the design draws no back control (the system back gesture still works).
  useNoBackByDesign();
  const model = sos.model;

  useEffect(() => {
    if (acked.current || model === null || sosId === null) return;
    if (model.role !== 'crew' || model.state !== 'open' || model.myResponse !== null) return;
    acked.current = true;
    void respond.send({ sos_id: sosId, state: 'seen' });
  }, [model, sosId, respond]);

  if (model === null || sosId === null) return null;
  const guideSlug = hub.trip?.guide_slug ?? 'tokek';
  const guide = GUIDE_IDS.includes(guideSlug)
    ? GUIDE_STICKERS[guideSlug as keyof typeof GUIDE_STICKERS]
    : GUIDE_STICKERS.tokek;
  const guideName = hub.trip?.guide_name ?? guide.name;
  const general = hub.model.general.number;
  const fromSender = sos.messages.filter((m) => m.sender_id === sos.row?.user_id);
  const name = model.senderName;

  return (
    <SosView
      hero={{
        model,
        words: model.words ?? presetWords(model.preset, t),
        message: senderBubble(
          fromSender[fromSender.length - 1] ?? null,
          sos.row,
          model.words,
          presetWords(model.preset, t),
        ),
        distanceM: sos.distanceM,
      }}
      steps={{ guideName, guideSticker: guide }}
      model={model}
      general={general}
      senderPhone={sos.senderPhone}
      busy={respond.pending || resolve.pending}
      onGoing={() => {
        void respond.send({ sos_id: sosId, state: 'coming' }).then((result) => {
          if (result.kind === 'rejected') return feedback.emit('error');
          feedback.emit('success');
          toast.show({
            // eslint-disable-next-line lingui/no-unlocalized-strings -- toast de-dupe key.
            id: `sos-going-${sosId}`,
            title: t({ id: 'safety.sos.knows', message: `${name} knows you're coming.` }),
          });
        });
      }}
      onCallSender={() => {
        if (sos.senderPhone !== null) dial(sos.senderPhone);
      }}
      onCallGeneral={() => dial(general)}
      onOk={() => {
        void resolve.send({
          sos_id: sosId,
          ...(model.state === 'stale' ? { false_alarm: true } : {}),
        });
      }}
      onSafe={() => void resolve.send({ sos_id: sosId })}
      onSendAgain={() => {
        if (tripId === null) return;
        const fresh = generateUuidV7();
        void trigger
          .send({ trip_id: tripId, sos_id: fresh, confirm_of: sosId })
          .then(() => router.replace(safetyRoutes.sos(fresh)));
      }}
      onMap={() => router.push(safetyRoutes.map(sosId))}
      onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
