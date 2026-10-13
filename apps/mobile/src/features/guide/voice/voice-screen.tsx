/**
 * Voice mode on the device: the speech module listens and plays, the question goes out as a voice
 * turn on the guide's thread, and speaking over the reply interrupts it where the phone cancels
 * its own echo. The changes the guide offers can go to the crew as a vote.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, api paths and wire codes, never copy. */
import { router } from 'expo-router';
import { useContext, useEffect, useRef, useState, type ComponentType } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import type { GuideThreadMode } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { openPermissionSettings, requestWithPrimer } from '@/lib/permissions';
import { guideSticker } from '@/ui/avatar/guides';
import { CritterSticker, PremiumSessionWaiting } from '@/ui/premium';

import { guideAvatarId } from '../chat/data/guide-avatar';
import { GuideStreamError } from '../chat/data/guide-frames';
import { queueQuestion } from '../chat/data/guide-question-queue';
import { streamGuide } from '../chat/data/guide-stream';
import { useGuideContext } from '../chat/data/use-guide-context';
import {
  createVoiceController,
  type VoiceController,
  type VoiceListening,
  type VoicePorts,
} from './voice-controller';
import { useVoiceProposals } from './use-voice-proposals';
import {
  refusalOf,
  useVoiceConsent,
  withVoiceConsent,
  type VoiceConsentGuard,
} from './voice-consent';
import { VoiceGate, type VoiceConsentViewProps } from './voice-gate';
import { useVoiceTarget, voiceTurnRequest } from './voice-target';
import { VOICE_IDLE, type VoiceState } from './voice-turn';

import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { type VoiceGroupSend } from './voice-swaps';
import { type VoiceSwap } from './voice-swaps';

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
  if (!response.ok) throw await refusalOf(response, 'stt token');
  return (await response.json()) as SttToken;
}

export interface VoiceScreenProps {
  readonly tripId: string | null;
  /** GROUP or JUST ME, as the sheet that opened voice mode had it; null works it out (a link). */
  readonly mode?: GuideThreadMode | null;
  /** Null in a build without the speech module: the screen says so and offers typing. */
  readonly speech: VoiceSpeech | null;
  /** Start listening as the screen opens (the guide sheet's microphone was held, not tapped). */
  readonly talkOnOpen?: boolean;
  /** The view that draws voice mode. */
  readonly View: ComponentType<VoiceViewProps>;
  /** The view that asks for the voice consent first. */
  readonly Consent: ComponentType<VoiceConsentViewProps>;
}

export function VoiceScreen(props: VoiceScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? (
    <PremiumSessionWaiting testID="guide-voice-waiting" />
  ) : (
    <ConsentedVoiceScreen {...props} />
  );
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
      sticker={<CritterSticker kind={sticker.kind} name={sticker.name} size={96} />}
      guideKind={sticker.kind}
      Consent={props.Consent}
      onAgree={consent.agree}
      onType={() => router.back()}
    >
      <OpenVoiceScreen {...props} consent={consent} />
    </VoiceGate>
  );
}

function OpenVoiceScreen({
  tripId,
  mode: given = null,
  speech,
  talkOnOpen = false,
  consent,
  View,
}: VoiceScreenProps & { readonly consent: VoiceConsentGuard }) {
  const { i18n } = useLingui();
  const { context, target } = useVoiceTarget(tripId, given);
  const trip = context.trip;
  const mode = target.mode;
  const sync = useSyncStatus();
  const level = useSharedValue(0);
  const [state, setState] = useState<VoiceState>(VOICE_IDLE);
  // The ports read the latest thread, trip and connection without rebuilding the controller.
  const live = useRef({ ...target, online: true });
  const online = sync.phase !== 'offline';
  const { threadId, tripId: liveTripId, uid } = target;
  useEffect(() => {
    live.current = { threadId, tripId: liveTripId, uid, mode, online };
  }, [threadId, liveTripId, uid, mode, online]);
  const controller = useRef<VoiceController | null>(null);
  const openedTalking = useRef(false);
  const locale = i18n.locale;

  useEffect(() => {
    const ports: VoicePorts = {
      allowMicrophone: async () => {
        const outcome = await requestWithPrimer('microphone', 'voice').catch(() => null);
        return outcome?.result === 'granted' || outcome?.result === 'partial';
      },
      // The speech service's token is refused without the consent: the question is asked again.
      listen:
        speech === null
          ? null
          : (onPartial) =>
              speech.listen(locale, () => withVoiceConsent(sttToken, consent), onPartial),
      online: () => live.current.online,
      consentRequired: consent.askAgain,
      // A refusal right after the yes is the yes still landing: the turn is tried once more.
      ask: (text, options, onFrame, signal) =>
        withVoiceConsent(async () => {
          // The mode, trip and thread are read once: the whole turn is asked in one place.
          let asked = { ...live.current };
          for (let attempt = 0; ; attempt += 1) {
            try {
              const turn = voiceTurnRequest(asked, text, options.speak);
              return await streamGuide(turn.path, turn.body, onFrame, { signal });
            } catch (error) {
              // A thread the server already has for this mode and trip answers with its id.
              const existing = error instanceof GuideStreamError ? error.detail['thread_id'] : null;
              if (attempt > 0 || typeof existing !== 'string') throw error;
              asked = { ...asked, threadId: existing };
              if (live.current.mode === asked.mode && live.current.tripId === asked.tripId) {
                live.current.threadId = existing;
              }
            }
          }
        }, consent),
      queueOffline: (text) => queueQuestion(live.current, text),
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
  }, [speech, locale, level, talkOnOpen, consent]);

  const offered = useVoiceProposals(trip?.tripId ?? null, state.proposals, mode === 'group');
  const sticker = guideSticker(guideAvatarId(context.guideSlug));
  return (
    <View
      guideName={context.guideName}
      guideKind={sticker.kind}
      shared={mode === 'group'}
      sticker={<CritterSticker kind={sticker.kind} name={sticker.name} size={VOICE_STICKER_SIZE} />}
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
      onType={() => {
        // Listening and the reply stop now, not when the screen has finished sliding away.
        controller.current?.dispose();
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }}
      onOpenSettings={() => void openPermissionSettings('microphone')}
    />
  );
}

export interface VoiceViewProps {
  readonly guideName: string;
  /** The crew sees this conversation (group mode); otherwise it is the asker's own. */
  readonly shared: boolean;
  readonly sticker: ReactNode;
  /** The guide's critter kind, for a view that draws the guide itself. */
  readonly guideKind?: string;
  readonly state: VoiceState;
  readonly level: SharedValue<number>;
  /** The changes the guide offered in this turn. */
  readonly swaps: readonly VoiceSwap[];
  /** What each share moves by for change sets with several changes ("+$22"). */
  readonly costs: readonly string[];
  /** Null when there is nothing to send to the group. */
  readonly group: VoiceGroupSend | null;
  readonly onTalk: () => void;
  readonly onSend: () => void;
  readonly onInterrupt: () => void;
  /** Back to the guide sheet: the ✕, and "Type instead" where talking cannot start. */
  readonly onType: () => void;
  readonly onOpenSettings?: () => void;
}

/** The guide's sticker on the stage: it nearly fills the disc, as in the render. */
export const VOICE_STICKER_SIZE = 144;
