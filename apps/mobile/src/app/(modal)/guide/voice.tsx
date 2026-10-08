import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { threadModeOf } from '@/features/guide/chat/data/use-guide-thread';
import { VoiceScreen, type VoiceSpeech } from '@/features/guide/voice/voice-screen';

import { createBargeIn, getSpeech, startListening } from '../../../../modules/cp-speech';

/** The native speech module as the voice screen uses it; null in a build without the module. */
function deviceSpeech(): VoiceSpeech | null {
  const speech = getSpeech();
  if (speech === null) return null;
  return {
    echoCancellation: speech.capabilities().echoCancellation,
    listen: (locale, getToken, onPartial) =>
      startListening(speech, { locale, getToken, onPartial }),
    play: (turn, chunk) => void speech.playChunks(turn, [chunk]).catch(() => false),
    cancelPlayback: () => speech.cancelPlayback(),
    outputVolume: () => speech.outputVolume(),
    setMuted: (muted) => speech.setMuted(muted),
    onLevel: (listener) => speech.addListener('onLevel', (event) => listener(event.level)),
    onDrained: (listener) =>
      speech.addListener('onPlayback', (event) => {
        if (event.state === 'drained') listener();
      }),
    bargeIn: (onInterrupt) => createBargeIn(speech, ({ by }) => onInterrupt(by)),
    endSession: () => void speech.endSession().catch(() => undefined),
  };
}

/**
 * Voice mode (3j-2): talk to the guide, from the guide sheet's microphone. The first time, the
 * voice consent step comes first (on Android, and for languages the phone cannot transcribe
 * itself, what is said goes to a speech service). `mode` is the sheet's GROUP / JUST ME choice:
 * what is said is asked there. `talk` opens it already listening (the microphone was held).
 */
export default function VoiceRoute() {
  const { tripId, mode, talk } = useLocalSearchParams<{
    tripId?: string;
    mode?: string;
    talk?: string;
  }>();
  const speech = useMemo(() => deviceSpeech(), []);
  return (
    <VoiceScreen
      tripId={typeof tripId === 'string' && tripId !== '' ? tripId : null}
      mode={threadModeOf(mode) ?? null}
      speech={speech}
      talkOnOpen={talk === '1'}
    />
  );
}
