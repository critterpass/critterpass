/* eslint-disable lingui/no-unlocalized-strings -- wire values, formats and ids, never copy. */
/**
 * The album's upload queue on this device: each picked photo is hashed, skipped when the album
 * already has the same bytes, uploaded through the media api (presigned PUT, multipart above
 * 5 MB) and then registered with `register_photo`, which waits in the offline queue if it has to.
 * A photo that could not reach the server waits and goes again on `resume()` (back online, the
 * app back in front); one the server refused is marked failed until the traveller retries it.
 */
import type { RegisterPhotoPayload } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';
import type { PickedPhoto, UploadInput, UploadOutcome } from '@/features/crew';

export type UploadState = 'uploading' | 'waiting' | 'failed' | 'done' | 'duplicate';

export interface UploadItem {
  readonly id: string;
  /** The trip whose album it is going to. */
  readonly tripId: string;
  readonly uri: string;
  readonly state: UploadState;
  readonly progress: number;
}

export interface PickedAlbumPhoto extends PickedPhoto {
  /** When the camera took it, with its offset (from the photo's EXIF date), if known. */
  readonly takenAt?: string;
}

/** The album's uploads as the screen sees them, whichever way the bytes travel. */
export interface AlbumUploads {
  readonly subscribe: (listener: () => void) => () => void;
  readonly items: () => readonly UploadItem[];
  /** Adds picked photos for a trip; `known` holds the SHA-256s the album already has. */
  add(tripId: string, photos: readonly PickedAlbumPhoto[], known: ReadonlySet<string>): void;
  /** Sends every waiting photo again (and a failed one when `failed` is set). */
  resume(known: ReadonlySet<string>, failed?: boolean): void;
  /** Forgets finished and skipped photos (of one trip, when given) once the album shows them. */
  clearSettled(tripId?: string): void;
}

export interface AlbumUploadPorts {
  readonly readBytes: (uri: string) => Promise<Uint8Array>;
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
  /** Uploads the bytes through the media api (presigned PUT, multipart above 5 MB). */
  readonly upload: (
    input: UploadInput,
    onProgress: (fraction: number) => void,
  ) => Promise<UploadOutcome>;
  readonly register: (payload: RegisterPhotoPayload) => Promise<SendResult>;
  readonly newId: () => string;
}

interface Entry {
  item: UploadItem;
  readonly photo: PickedAlbumPhoto;
  readonly tripId: string;
}

export class AlbumUploadQueue implements AlbumUploads {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private snapshot: readonly UploadItem[] = [];
  private running = false;

  constructor(private readonly ports: AlbumUploadPorts) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  items = (): readonly UploadItem[] => this.snapshot;

  /** Adds picked photos for a trip; `known` holds the SHA-256s the album already has. */
  add(tripId: string, photos: readonly PickedAlbumPhoto[], known: ReadonlySet<string>): void {
    for (const photo of photos) {
      const id = this.ports.newId();
      this.entries.set(id, {
        item: { id, tripId, uri: photo.uri, state: 'uploading', progress: 0 },
        photo,
        tripId,
      });
    }
    this.emit();
    void this.drain(known);
  }

  /** Sends every waiting photo again (and a failed one when `failed` is set). */
  resume(known: ReadonlySet<string>, failed = false): void {
    for (const entry of this.entries.values()) {
      if (entry.item.state === 'waiting' || (failed && entry.item.state === 'failed')) {
        entry.item = { ...entry.item, state: 'uploading', progress: 0 };
      }
    }
    this.emit();
    void this.drain(known);
  }

  /** Forgets finished and skipped photos (of one trip, when given) once the album shows them. */
  clearSettled(tripId?: string): void {
    let cleared = false;
    for (const [id, entry] of this.entries) {
      if (tripId !== undefined && entry.tripId !== tripId) continue;
      if (entry.item.state === 'done' || entry.item.state === 'duplicate') {
        this.entries.delete(id);
        cleared = true;
      }
    }
    if (cleared) this.emit();
  }

  private async drain(known: ReadonlySet<string>): Promise<void> {
    if (this.running) return;
    this.running = true;
    const seen = new Set(known);
    try {
      for (;;) {
        const next = [...this.entries.values()].find((entry) => entry.item.state === 'uploading');
        if (next === undefined) return;
        await this.send(next, seen);
      }
    } finally {
      this.running = false;
    }
  }

  private async send(entry: Entry, seen: Set<string>): Promise<void> {
    const set = (state: UploadState, progress = entry.item.progress) => {
      entry.item = { ...entry.item, state, progress };
      this.emit();
    };
    let bytes: Uint8Array;
    let sha: string;
    try {
      bytes = await this.ports.readBytes(entry.photo.uri);
      sha = await this.ports.sha256(bytes);
    } catch {
      set('failed');
      return;
    }
    if (seen.has(sha)) {
      set('duplicate', 1);
      return;
    }
    const outcome = await this.ports.upload(
      { purpose: 'photo', contentType: 'image/jpeg', bytes, sha256: sha },
      (fraction) => set('uploading', Math.min(0.95, fraction)),
    );
    if (outcome.kind === 'offline') return set('waiting', 0);
    if (outcome.kind === 'error') return set('failed', 0);
    const result = await this.ports.register({
      photo_id: entry.item.id,
      trip_id: entry.tripId,
      media_key: outcome.mediaKey,
      sha256: sha,
      width: entry.photo.width,
      height: entry.photo.height,
      ...(entry.photo.takenAt === undefined ? {} : { taken_at: entry.photo.takenAt }),
      // The picker re-encodes the photo; the server still checks for GPS tags and removes them.
      exif_gps_stripped: false,
      faces_opt_in: false,
    });
    if (result.kind === 'rejected') return set('failed', 0);
    if (result.kind === 'unavailable') return set('waiting', 0);
    seen.add(sha);
    set('done', 1);
  }

  private emit(): void {
    this.snapshot = [...this.entries.values()].map((entry) => entry.item);
    for (const listener of this.listeners) listener();
  }
}

/** "2026:10:04 06:02:11" with an optional "+07:00" offset → ISO, or undefined. */
export function exifTakenAt(date: unknown, offset: unknown): string | undefined {
  if (typeof date !== 'string') return undefined;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/u.exec(date);
  if (match === null || typeof offset !== 'string' || !/^[+-]\d{2}:\d{2}$/u.test(offset)) {
    return undefined;
  }
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
}

/** Two queues shown as one: new photos go to `primary`, which may hand some to `fallback`. */
export function joinUploads(primary: AlbumUploads, fallback: AlbumUploads): AlbumUploads {
  const listeners = new Set<() => void>();
  let snapshot: readonly UploadItem[] = [...primary.items(), ...fallback.items()];
  const refresh = () => {
    snapshot = [...primary.items(), ...fallback.items()];
    for (const listener of listeners) listener();
  };
  primary.subscribe(refresh);
  fallback.subscribe(refresh);
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    items: () => snapshot,
    add: (tripId, photos, known) => primary.add(tripId, photos, known),
    resume: (known, failed) => {
      primary.resume(known, failed);
      fallback.resume(known, failed);
    },
    clearSettled: (tripId) => {
      primary.clearSettled(tripId);
      fallback.clearSettled(tripId);
    },
  };
}
