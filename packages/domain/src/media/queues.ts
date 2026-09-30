/**
 * Editorial media job queue: `media.ingest` downloads one published stock photo or video and
 * stores its sizes, keyed per asset.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const MEDIA_QUEUE_SPECS = {
  'media.ingest': {
    policy: 'exclusive',
    notify: true,
    retryLimit: 3,
    deadLetter: true,
    expireInSeconds: 10 * 60,
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function mediaQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof MEDIA_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(MEDIA_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof MEDIA_QUEUE_SPECS, QueueSpec>;
}

export const MEDIA_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof MEDIA_QUEUE_SPECS, string>> = {
  'media.ingest': 'Stores the sizes, blurhash and video loop of a published stock photo or video',
};
