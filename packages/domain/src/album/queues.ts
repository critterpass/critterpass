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
  'album.export': {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 120,
    expireInSeconds: 30 * 60,
    deadLetter: true,
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
};

export const albumProcessPhotoJobSchema = z.object({ photo_id: z.uuid() });
export type AlbumProcessPhotoJob = z.infer<typeof albumProcessPhotoJobSchema>;

export const albumExportJobSchema = z.object({ export_id: z.uuid() });
export type AlbumExportJob = z.infer<typeof albumExportJobSchema>;
