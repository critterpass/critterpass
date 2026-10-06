/**
 * Tirta Empul's AI profile as `GET /v1/places/{id}` sends it, for the place page's lab scene with
 * an AI summary, its facts, the pages it was written from and "Report a problem".
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReadyProfile } from '@/data/places/place-read';

export const LAB_PLACE_PROFILE: ReadyProfile = {
  status: 'ready',
  locale: 'en',
  whyGo:
    'A spring-fed temple where Balinese families bathe under the carved spouts of the purification pool.',
  bestTime: 'Before 9:00, ahead of the tour buses',
  crowd: 'Busiest late morning; quieter after 16:00',
  visitMin: 90,
  facts: [
    {
      kind: 'entry',
      text: 'Adult ticket 75,000 IDR, sarong included',
      sourceUrl: 'https://www.indonesia.travel/tirta-empul',
      secondSource: 'agrees',
    },
    {
      kind: 'dress',
      text: 'Shoulders and knees covered; a sarong is lent at the gate',
      sourceUrl: 'https://www.indonesia.travel/tirta-empul',
    },
  ],
  photos: [],
  sources: [
    { url: 'https://www.indonesia.travel/tirta-empul', title: 'Tirta Empul Temple' },
    { url: 'https://en.wikipedia.org/wiki/Tirta_Empul_Temple', title: '' },
  ],
  generatedAt: '2026-10-05T09:00:00.000Z',
};
