/**
 * Album job queues (docs/api-contracts-async.md §2.3): a registered photo's processing (EXIF GPS
 * check, thumbnail and display copy), and "download all". One processing run per photo and one
 * export run per export.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const ALBUM_QUEUES = {
  processPhoto: 'album.process_photo',
  export: 'album.export',
  curate: 'ai.curate_album',
  postcardFulfil: 'postcard.fulfil',
  postcardStatus: 'postcard.status',
} as const;

export const ALBUM_QUEUE_SPECS = {
  'album.process_photo': {
    policy: 'exclusive',
    retryLimit: 4,
    retryDelay: 30,
    expireInSeconds: 5 * 60,
    deadLetter: true,
    notify: true,
  },
  'ai.curate_album': {
    policy: 'stately',
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 10 * 60,
  },
  'album.export': {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 30 * 60,
    deadLetter: true,
  },
  'postcard.fulfil': {
    policy: 'exclusive',
    retryLimit: 4,
    retryDelay: 120,
    retryBackoff: true,
    expireInSeconds: 15 * 60,
    deadLetter: true,
  },
  'postcard.status': {
    policy: 'stately',
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 5 * 60,
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function albumQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof ALBUM_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(ALBUM_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof ALBUM_QUEUE_SPECS, QueueSpec>;
}

export const ALBUM_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof ALBUM_QUEUE_SPECS, string>> = {
  'album.process_photo':
    "Checks a new album photo's GPS tags are gone and makes its thumbnail and display copy",
  'album.export': "Zips a trip album's originals for one traveller to download for 7 days",
  'ai.curate_album':
    "Picks the album's best 24 (everyone in three where they can be) and words the guide's note",
  'postcard.fulfil':
    'Prints a Pass+ postcard and orders one mailed to each crewmate with a saved address',
  'postcard.status':
    "Re-reads a printed mailing's orders from the printer and records how far they got",
};

export const albumProcessPhotoJobSchema = z.object({ photo_id: z.uuid() });
export type AlbumProcessPhotoJob = z.infer<typeof albumProcessPhotoJobSchema>;

export const albumExportJobSchema = z.object({ export_id: z.uuid() });
export type AlbumExportJob = z.infer<typeof albumExportJobSchema>;

export const postcardFulfilJobSchema = z.object({ mailing_id: z.uuid() });
export type PostcardFulfilJob = z.infer<typeof postcardFulfilJobSchema>;

export const postcardStatusJobSchema = z.object({ mailing_id: z.uuid() });
export type PostcardStatusJob = z.infer<typeof postcardStatusJobSchema>;

export const albumCurateJobSchema = z.object({ trip_id: z.uuid() });
export type AlbumCurateJob = z.infer<typeof albumCurateJobSchema>;

/** Curation waits this long after the first new photo, so a burst of uploads becomes one run. */
export const ALBUM_CURATE_DEBOUNCE_SECONDS = 10 * 60;

/**
 * The curation an appended event asks for: new or removed photos curate the trip's album after the
 * debounce, and a trip changing status (ending, above all) curates it at once; a run over an
 * album with no photos does nothing. One run queued and one running per trip.
 */
export function albumCurateForEvent(event: {
  readonly type: string;
  readonly tripId: string | null;
}): {
  readonly queue: typeof ALBUM_QUEUES.curate;
  readonly data: AlbumCurateJob;
  readonly options: { readonly singletonKey: string; readonly startAfter?: number };
} | null {
  if (event.tripId === null) return null;
  const singletonKey = `album:${event.tripId}`;
  if (event.type === 'photo.added' || event.type === 'photo.deleted') {
    return {
      queue: ALBUM_QUEUES.curate,
      data: { trip_id: event.tripId },
      options: { singletonKey, startAfter: ALBUM_CURATE_DEBOUNCE_SECONDS },
    };
  }
  if (event.type === 'trip.status_changed') {
    return {
      queue: ALBUM_QUEUES.curate,
      data: { trip_id: event.tripId },
      options: { singletonKey },
    };
  }
  return null;
}
