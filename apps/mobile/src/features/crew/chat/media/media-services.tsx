/**
 * What chat media needs from the device, as ports so screens and the upload queue are testable
 * without native code: the photo picker and camera, file bytes and hashing, the media api over
 * HTTP, the microphone, an audio player and the system settings. The route provides the device
 * implementation; without a provider the chat offers no attachments.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface PickedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  /** Bytes of the (already compressed) image, when the picker reports it. */
  readonly bytes?: number;
}

export type PickOutcome =
  | { readonly kind: 'picked'; readonly photos: readonly PickedPhoto[] }
  | { readonly kind: 'cancelled' }
  /** The system refused access (camera permission). */
  | { readonly kind: 'denied' }
  /** The picker itself failed: not a refusal, so trying again may work. */
  | { readonly kind: 'failed' };

export interface MediaHttpResponse {
  readonly status: number;
  readonly body: unknown;
  /** The `ETag` of an S3 part upload. */
  readonly etag?: string | null;
}

export interface MediaHttp {
  readonly postJson: (path: string, body: unknown) => Promise<MediaHttpResponse>;
  readonly put: (
    url: string,
    headers: Readonly<Record<string, string>>,
    bytes: Uint8Array,
    onProgress: (fraction: number) => void,
  ) => Promise<MediaHttpResponse>;
}

export type RecordStart = 'recording' | 'denied';

export interface Recording {
  readonly uri: string;
  readonly durationMs: number;
}

export interface VoiceRecorderPort {
  readonly start: () => Promise<RecordStart>;
  /** Stops and returns the file, or null when nothing usable was recorded. */
  readonly stop: () => Promise<Recording | null>;
  readonly cancel: () => Promise<void>;
  /** Normalised input level 0–1 while recording (for the live waveform). */
  readonly level: () => number;
}

export interface PlayerPort {
  readonly play: () => void;
  readonly pause: () => void;
  readonly setRate: (rate: number) => void;
  /** Seconds played, and the total when known. */
  readonly position: () => { readonly current: number; readonly duration: number };
  readonly playing: () => boolean;
  readonly release: () => void;
}

export interface ChatMediaServices {
  readonly pickPhotos: (source: 'library' | 'camera') => Promise<PickOutcome>;
  readonly readBytes: (uri: string) => Promise<Uint8Array>;
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
  readonly http: MediaHttp;
  readonly recorder: VoiceRecorderPort;
  /**
   * A voice note's audio as a local file: the saved copy, else downloaded once from the signed URL
   * `signedUrl` mints; null when it cannot be fetched.
   */
  readonly audioFile: (
    key: string,
    signedUrl: () => Promise<string | null>,
  ) => Promise<string | null>;
  /** A player for a local audio file. */
  readonly createPlayer: (uri: string) => PlayerPort;
  readonly openSettings: () => void;
}

const ChatMediaContext = createContext<ChatMediaServices | null>(null);

export function ChatMediaProvider({
  services,
  children,
}: {
  readonly services: ChatMediaServices | null;
  readonly children: ReactNode;
}) {
  return <ChatMediaContext.Provider value={services}>{children}</ChatMediaContext.Provider>;
}

export function useChatMedia(): ChatMediaServices | null {
  return useContext(ChatMediaContext);
}
