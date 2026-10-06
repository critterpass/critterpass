import { NativeModule, requireOptionalNativeModule } from 'expo';

/** Which recogniser hears the mic: the platform's on-device one, or `onAudio` frames for Deepgram. */
export type ListenEngine = 'device' | 'stream';

/** One chunk of a spoken reply (`audio{seq, url|b64}` on the turn stream); `seq` counts from 0. */
export interface ReplyAudioChunk {
  readonly seq: number;
  readonly url?: string;
  readonly b64?: string;
}

export type PlaybackState = 'started' | 'drained' | 'cancelled' | 'error';

export interface PlaybackEvent {
  readonly state: PlaybackState;
  readonly turn?: string;
  readonly seq?: number;
}

export interface SessionEvent {
  /** `interrupted` (a call, Siri), `resumed`, `route` (headset, Bluetooth, speaker) or `reset`. */
  readonly event: 'interrupted' | 'resumed' | 'route' | 'reset';
  readonly route?: string;
  readonly shouldResume?: boolean;
}

export interface SpeechCapabilities {
  /** The capture is echo-cancelled, so speaking over the reply can interrupt it. */
  readonly echoCancellation: boolean;
  /** This build can replay a WAV file in place of the mic (debug and development builds). */
  readonly fixtureInput: boolean;
}

export type SpeechEvents = {
  /** Everything heard so far in this utterance. */
  onPartial: (event: { readonly text: string }) => void;
  /** The whole utterance, once, after `stop()` (on-device engine). */
  onFinal: (event: { readonly text: string }) => void;
  /** About 30 a second: `rms` of the echo-cancelled mic, `level` 0..1 for the waveform. */
  onLevel: (event: { readonly rms: number; readonly level: number }) => void;
  /** The voice activity detector heard speech start; `playing` while a reply was playing. */
  onSpeechStart: (event: { readonly playing: boolean; readonly atMs: number }) => void;
  onSpeechEnd: (event: { readonly atMs: number }) => void;
  onPlayback: (event: PlaybackEvent) => void;
  /** Stream engine: 100 ms of 16 kHz mono 16-bit little-endian PCM, base64. */
  onAudio: (event: { readonly pcm: string }) => void;
  onSession: (event: SessionEvent) => void;
  /** The fixture WAV ran out (debug and development builds). */
  onFixtureEnd: (event: Record<string, never>) => void;
};

/**
 * The native binding (Swift `CpSpeechModule` / Kotlin `CpSpeechModule`).
 * `requireOptionalNativeModule` answers `null` in a binary built without it (Jest, or a build from
 * before the module existed); the guide then offers typing only.
 */
export declare class NativeCpSpeechModule extends NativeModule<SpeechEvents> {
  start(locale: string, engine: ListenEngine): Promise<void>;
  stop(): Promise<void>;
  isOnDeviceSupported(locale: string): Promise<boolean>;
  /** False when replies are muted: nothing plays and the reply shows as text. */
  playChunks(turn: string, chunks: readonly ReplyAudioChunk[]): Promise<boolean>;
  cancelPlayback(): void;
  setMuted(muted: boolean): void;
  /** Media output volume 0..1; at 0 the reply shows as text only. */
  outputVolume(): number;
  capabilities(): SpeechCapabilities;
  /** Leaves voice mode and gives the audio session back to other apps. */
  endSession(): Promise<void>;
  /** Debug and development builds: a `file://` WAV replaces the mic; null returns to the mic. */
  setInputSource(fixtureAudio: string | null): boolean;
}

export const nativeCpSpeechModule = requireOptionalNativeModule<NativeCpSpeechModule>('CpSpeech');
