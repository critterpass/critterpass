/**
 * Voice mode on the device: the speech module listens and plays, the question goes out as a voice
 * turn on the guide's thread, and speaking over the reply interrupts it where the phone cancels
 * its own echo. The changes the guide offers can go to the crew as a vote.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, api paths and wire codes, never copy. */
import { router } from 'expo-router';
import { useContext, useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import { generateUuidV7 } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { sessionHeaders } from '@/data/app-session/device-session';
import { questionQueue } from '@/data/places/question-queue';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { openPermissionSettings, requestWithPrimer } from '@/lib/permissions';
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { guideAvatarId } from '../chat/components/guide-header';
import { GuideStreamError } from '../chat/data/guide-frames';
import { streamGuide } from '../chat/data/guide-stream';
import { useGuideContext } from '../chat/data/use-guide-context';
import { useGuideThread } from '../chat/data/use-guide-thread';
import {
  createVoiceController,
  type VoiceController,
  type VoiceListening,
  type VoicePorts,
} from './voice-controller';
import { useVoiceProposals } from './use-voice-proposals';
import { useVoiceConsent } from './voice-consent';
import { VoiceGate } from './voice-consent-view';
import { VOICE_IDLE, type VoiceState } from './voice-turn';
import { VoiceView } from './voice-view';

/** The speech module as the screen uses it; the route adapts the native module to this. */
export interface VoiceSpeech {
  /** The capture is echo-cancelled, so speaking over the reply can interrupt it. */
  readonly echoCancellation: boolean;
  listen(
    locale: string,
    getToken: () => Promise<SttToken>,
    onPartial: (text: string) => void,
  ): Promise<VoiceListening>;
  play(turn: string, chunk: { seq: number; b64?: string; url?: string }): void;
  cancelPlayback(): void;
  outputVolume(): number;
  setMuted(muted: boolean): void;
  onLevel(listener: (level: number) => void): { remove(): void };
  onDrained(listener: () => void): { remove(): void };
  /** Watches for the reply being talked or tapped over. */
  bargeIn(onInterrupt: (by: 'speech' | 'tap') => void): {
    streamEnded(turn: string): void;
    dispose(): void;
  };
  endSession(): void;
}

/** `POST /v1/stt/token`: a short-lived streaming credential. */
export interface SttToken {
  readonly token: string;
  readonly scheme: 'bearer';
  readonly expires_at: string;
}

export async function sttToken(): Promise<SttToken> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/stt/token`, {
    method: 'POST',
    headers: await sessionHeaders(),
  });
  if (!response.ok) throw new Error(`stt token answered ${response.status}`);
  return (await response.json()) as SttToken;
}

export interface VoiceScreenProps {
  readonly tripId: string | null;
  /** Null in a build without the speech module: the screen says so and offers typing. */
  readonly speech: VoiceSpeech | null;
  /** Start listening as the screen opens (the guide sheet's microphone was held, not tapped). */
  readonly talkOnOpen?: boolean;
}

export function VoiceScreen(props: VoiceScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? null : <ConsentedVoiceScreen {...props} />;
}

/** Voice mode once the voice consent stands; until then, the question. */
function ConsentedVoiceScreen(props: VoiceScreenProps) {
  const context = useGuideContext(props.tripId);
  const consent = useVoiceConsent();
  const sticker = guideSticker(guideAvatarId(context.guideSlug));
  return (
    <VoiceGate
      status={consent.status}
      guideName={context.guideName}
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={96} />}
      onAgree={consent.agree}
      onType={() => router.back()}
    >
      <OpenVoiceScreen {...props} />
    </VoiceGate>
  );
}

function OpenVoiceScreen({ tripId, speech, talkOnOpen = false }: VoiceScreenProps) {
  const { i18n } = useLingui();
  const context = useGuideContext(tripId);
  const trip = context.trip;
  const mode = trip !== null && trip.crewSize > 1 ? 'group' : 'private';
  const thread = useGuideThread(mode, trip?.tripId ?? null, context.uid);
  const sync = useSyncStatus();
  const level = useSharedValue(0);
  const [state, setState] = useState<VoiceState>(VOICE_IDLE);
  // The ports read the latest thread, trip and connection without rebuilding the controller.
  const live = useRef({
    threadId: thread.threadId,
    tripId: trip?.tripId ?? null,
    mode,
    online: true,
  });
  const online = sync.phase !== 'offline';
  const threadId = thread.threadId;
  const liveTripId = trip?.tripId ?? null;
  useEffect(() => {
    live.current = { threadId, tripId: liveTripId, mode, online };
  }, [threadId, liveTripId, mode, online]);
  const controller = useRef<VoiceController | null>(null);
  const openedTalking = useRef(false);
  const locale = i18n.locale;

  useEffect(() => {
    const ports: VoicePorts = {
      allowMicrophone: async () => {
        const outcome = await requestWithPrimer('microphone', 'voice').catch(() => null);
        return outcome?.result === 'granted' || outcome?.result === 'partial';
      },
      listen: speech === null ? null : (onPartial) => speech.listen(locale, sttToken, onPartial),
      online: () => live.current.online,
      ask: async (text, options, onFrame, signal) => {
        let threadId = live.current.threadId;
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await streamGuide(
              `/v1/guide/threads/${threadId}/turns`,
              {
                text,
                mode: 'voice',
                speak: options.speak,
                thread_mode: live.current.mode,
                context: { trip_id: live.current.tripId, screen: '3j-2' },
              },
              onFrame,
              { signal },
            );
          } catch (error) {
            // A thread the server already has for this mode and trip answers with its id.
            const existing = error instanceof GuideStreamError ? error.detail['thread_id'] : null;
            if (attempt > 0 || typeof existing !== 'string') throw error;
            threadId = existing;
            live.current.threadId = existing;
          }
        }
      },
      queueOffline: (text) =>
        questionQueue().enqueue({
          id: generateUuidV7(),
          tripId: live.current.tripId,
          threadId: live.current.threadId,
          text,
        }),
      play: (turn, chunk) => speech?.play(turn, chunk),
      endOfReply: (turn) => bargeIn?.streamEnded(turn),
      cancelPlayback: () => speech?.cancelPlayback(),
      outputVolume: () => speech?.outputVolume() ?? 0,
      setMuted: (muted) => speech?.setMuted(muted),
    };
    const voice = createVoiceController(ports, setState);
    controller.current = voice;
    speech?.setMuted(voice.state.muted);
    if (talkOnOpen && !openedTalking.current) {
      openedTalking.current = true;
      void voice.talk();
    }
    const bargeIn = speech?.bargeIn((by) => voice.interrupted(by)) ?? null;
    const subscriptions =
      speech === null
        ? []
        : [
            speech.onLevel((value) => {
              level.value = value;
            }),
            speech.onDrained(() => voice.playbackDrained()),
          ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      bargeIn?.dispose();
      voice.dispose();
      controller.current = null;
      speech?.endSession();
    };
  }, [speech, locale, level, talkOnOpen]);

  const offered = useVoiceProposals(trip?.tripId ?? null, state.proposals, mode === 'group');
  const sticker = guideSticker(guideAvatarId(context.guideSlug));
  return (
    <VoiceView
      guideName={context.guideName}
      shared={mode === 'group'}
      sticker={<Sticker kind={sticker.kind} name={sticker.name} size={96} />}
      state={state}
      level={level}
      swaps={offered.swaps}
      costs={offered.costs}
      group={offered.group}
      onTalk={() => void controller.current?.talk()}
      onSend={() => void controller.current?.send()}
      onInterrupt={() => {
        controller.current?.interrupted('tap');
        void controller.current?.talk();
      }}
      onType={() => router.back()}
      onOpenSettings={() => void openPermissionSettings('microphone')}
    />
  );
}
