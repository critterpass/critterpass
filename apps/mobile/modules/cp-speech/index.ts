/**
 * Voice mode audio. The native module (iOS SpeechAnalyzer + voice-processing AVAudioEngine,
 * Android AudioRecord VOICE_COMMUNICATION + SpeechRecognizer + media3) listens on the
 * echo-cancelled mic, reports level and speech start/end, and plays the guide's reply chunks in
 * order. `startListening` picks the on-device recogniser where the platform has the locale and
 * Deepgram Nova-3 elsewhere; `createBargeIn` stops a reply when the user talks over it.
 */
import { nativeCpSpeechModule, type NativeCpSpeechModule } from './src/CpSpeechModule';

export type {
  ListenEngine,
  PlaybackEvent,
  PlaybackState,
  ReplyAudioChunk,
  SessionEvent,
  SpeechCapabilities,
  SpeechEvents,
} from './src/CpSpeechModule';
export {
  deepgramListenUrl,
  openDeepgramStream,
  type DeepgramErrorCode,
  type DeepgramStream,
  type SocketFactory,
  type SocketLike,
  type SttToken,
} from './src/deepgram';
export { createBargeIn, type BargeIn, type BargeInPort, type Interruption } from './src/barge-in';
export { startListening, type Listening, type ListenOptions, type ListenPort } from './src/listen';

export type SpeechModule = NativeCpSpeechModule;

/** Null in a build without the native module: the guide then offers typing only. */
export function getSpeech(): SpeechModule | null {
  return nativeCpSpeechModule;
}

/**
 * Debug and development builds: `{fixtureAudio: 'file://…wav'}` replays a WAV in place of the mic
 * (simulator, Maestro); `'mic'` returns to the microphone. False where the build has no fixture input.
 */
export function setInputSource(source: { readonly fixtureAudio: string } | 'mic'): boolean {
  return (
    nativeCpSpeechModule?.setInputSource(source === 'mic' ? null : source.fixtureAudio) ?? false
  );
}
