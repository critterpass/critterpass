/**
 * Test doubles for chat media at its boundaries: the media api answered by recorded responses
 * (presign, multipart, read URLs; every call recorded), and the device (picker, file bytes, hash,
 * microphone, audio player, Settings) as in-memory stand-ins.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are wire values. */
import type { ChatMediaServices, MediaHttp, PickOutcome } from '../media/media-services';

/** Length of the recorded test note. */
const NOTE_SECONDS = 4.2;

export interface RecordedMediaApi {
  readonly http: MediaHttp;
  readonly calls: { path: string; body: unknown }[];
  /** Media keys minted, in order. */
  readonly keys: string[];
  refusePresign: boolean;
  /** Read URLs answer 404, as for a key the caller may not read. */
  refuseReads: boolean;
  readUrlFor(key: string): string;
}

export function recordedMediaApi(): RecordedMediaApi {
  const calls: { path: string; body: unknown }[] = [];
  const keys: string[] = [];
  const api: RecordedMediaApi = {
    calls,
    keys,
    refusePresign: false,
    refuseReads: false,
    readUrlFor: (key) => `https://media.test/r/${encodeURIComponent(key)}?sig=abc`,
    http: {
      postJson(path, body) {
        calls.push({ path, body });
        const request = body as { purpose?: string };
        if (path === '/v1/media/presign') {
          if (api.refusePresign) {
            return Promise.resolve({
              status: 413,
              body: {
                error: { code: 'PAYLOAD_TOO_LARGE', message: 'too large', retryable: false },
              },
            });
          }
          const key = `u/me/${request.purpose ?? 'photo'}/${String(keys.length + 1)}`;
          keys.push(key);
          return Promise.resolve({
            status: 200,
            body: { media_key: key, put_url: 'https://r2.test/put', headers: {}, expires_at: '' },
          });
        }
        if (path === '/v1/media/multipart') {
          const key = `u/me/${request.purpose ?? 'photo'}/${String(keys.length + 1)}`;
          keys.push(key);
          return Promise.resolve({
            status: 200,
            body: { media_key: key, upload_id: 'up-1', part_bytes: 8 * 1024 * 1024, part_count: 2 },
          });
        }
        if (path.endsWith('/parts')) {
          const numbers = (body as { part_numbers: number[] }).part_numbers;
          return Promise.resolve({
            status: 200,
            body: {
              parts: numbers.map((n) => ({
                part_number: n,
                url: `https://r2.test/part/${String(n)}`,
              })),
              expires_at: '',
            },
          });
        }
        if (path.endsWith('/complete')) {
          return Promise.resolve({ status: 200, body: { media_key: keys.at(-1), bytes: 1 } });
        }
        if (path === '/v1/media/read-urls') {
          if (api.refuseReads) {
            return Promise.resolve({
              status: 404,
              body: { error: { code: 'NOT_FOUND', message: 'not found', retryable: false } },
            });
          }
          const requested = (body as { media_keys: string[] }).media_keys;
          return Promise.resolve({
            status: 200,
            body: {
              urls: requested.map((key) => ({ media_key: key, url: api.readUrlFor(key) })),
              expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
          });
        }
        return Promise.resolve({ status: 404, body: null });
      },
      put(url, _headers, _bytes, onProgress) {
        calls.push({ path: 'PUT', body: url });
        onProgress(1);
        const part = /\/part\/(\d+)$/u.exec(url)?.[1];
        return Promise.resolve({
          status: 200,
          body: null,
          etag: part === undefined ? null : `"etag-${part}"`,
        });
      },
    },
  };
  return api;
}

/** A player the double made: what it plays and where it stands (a test moves `at`). */
export interface PlayerDouble {
  url: string;
  rate: number;
  playing: boolean;
  /** Seconds played. */
  at: number;
  /** Seconds long; 0 until "loaded". */
  duration: number;
  /** The chat let go of it. */
  released: boolean;
}

export interface DeviceDouble extends ChatMediaServices {
  readonly picked: string[];
  readonly players: PlayerDouble[];
  /** Signed URLs voice notes were downloaded from, in order. */
  readonly downloads: string[];
}

export function deviceDouble(
  api: RecordedMediaApi,
  options: {
    readonly camera?: 'denied';
    readonly mic?: 'denied';
    /** The library picker throws on its first pick (a native failure, not a refusal). */
    readonly library?: 'fails-once';
  } = {},
): DeviceDouble {
  const picked: string[] = [];
  const players: PlayerDouble[] = [];
  const downloads: string[] = [];
  const saved = new Set<string>();
  let recording = false;
  let libraryFailures = options.library === 'fails-once' ? 1 : 0;
  return {
    picked,
    players,
    downloads,
    http: api.http,
    pickPhotos(source): Promise<PickOutcome> {
      picked.push(source);
      if (source === 'camera' && options.camera === 'denied')
        return Promise.resolve({ kind: 'denied' });
      if (source === 'library' && libraryFailures > 0) {
        libraryFailures -= 1;
        return Promise.resolve({ kind: 'failed' });
      }
      return Promise.resolve({
        kind: 'picked',
        photos: [{ uri: `file:///${source}-1.jpg`, width: 1200, height: 900 }],
      });
    },
    readBytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    sha256: () => Promise.resolve('a'.repeat(64)),
    recorder: {
      start: () => {
        if (options.mic === 'denied') return Promise.resolve('denied');
        recording = true;
        return Promise.resolve('recording');
      },
      stop: () => {
        recording = false;
        return Promise.resolve({ uri: 'file:///note.m4a', durationMs: 4200 });
      },
      cancel: () => {
        recording = false;
        return Promise.resolve();
      },
      level: () => (recording ? 0.6 : 0),
    },
    async audioFile(key, signedUrl) {
      const file = `file:///cache/chat_voice/${key.replace(/\//gu, '_')}.m4a`;
      if (saved.has(key)) return file;
      const url = await signedUrl();
      if (url === null) return null;
      downloads.push(url);
      saved.add(key);
      return file;
    },
    createPlayer(url) {
      const state: PlayerDouble = {
        url,
        rate: 1,
        playing: false,
        at: 0,
        duration: NOTE_SECONDS,
        released: false,
      };
      players.push(state);
      return {
        play: () => {
          state.playing = true;
        },
        pause: () => {
          state.playing = false;
        },
        setRate: (rate) => {
          state.rate = rate;
        },
        position: () => ({ current: state.at, duration: state.duration }),
        playing: () => state.playing,
        release: () => {
          state.playing = false;
          state.released = true;
        },
      };
    },
    openSettings: () => undefined,
  };
}
