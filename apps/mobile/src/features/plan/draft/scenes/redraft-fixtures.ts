/** The redraft of day 4 the design draws (Nara out, no trains), as fixed data for the scenes. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data (names, places, ids), never copy. */
import type { DraftPlace, RedraftChange, RedraftMetrics } from '@cp/domain';

import { at } from './fixtures';

export const PLACES: Readonly<Record<string, DraftPlace>> = {
  'p-nara': {
    name: 'Train to Nara, deer park',
    category: 'transit',
    lat: 34.68,
    lng: 135.84,
    editorial: true,
  },
  'p-lunch': { name: 'Lunch in Nara', category: 'food', lat: 34.68, lng: 135.83, editorial: true },
  'p-back': {
    name: 'Train back to Kyoto',
    category: 'transit',
    lat: 34.98,
    lng: 135.76,
    editorial: true,
  },
  'p-path': {
    name: 'Philosopher’s Path',
    category: 'walk',
    lat: 35.02,
    lng: 135.79,
    editorial: true,
  },
  'p-boat': {
    name: 'Okazaki canal boat',
    category: 'activity',
    lat: 35.01,
    lng: 135.78,
    editorial: true,
  },
  'p-tea': { name: 'Tea house', category: 'food', lat: 35.0, lng: 135.77, editorial: true },
};

const snap = (poi: string, time: string) => ({
  poi_id: poi,
  kind: 'activity' as const,
  starts_at: at('2027-04-05', time),
  ends_at: at('2027-04-05', time),
  amount_minor: 0,
});

export const CHANGES: readonly RedraftChange[] = [
  { op: 'remove', stable_id: 'i-nara', before: snap('p-nara', '09:12'), after: null, reason: null },
  {
    op: 'add',
    stable_id: 'i-path',
    before: null,
    after: snap('p-path', '09:00'),
    reason: 'Ginkaku-ji to Nanzen-ji on foot, blossoms most of the way.',
  },
  {
    op: 'remove',
    stable_id: 'i-lunch',
    before: snap('p-lunch', '12:30'),
    after: null,
    reason: null,
  },
  {
    op: 'add',
    stable_id: 'i-boat',
    before: null,
    after: snap('p-boat', '12:30'),
    reason: 'Twenty-five minutes under the cherry trees. I booked it.',
  },
  {
    op: 'remove',
    stable_id: 'i-back',
    before: snap('p-back', '17:40'),
    after: null,
    reason: 'A free evening before the move to Shijo. Rin asked for one.',
  },
];

export const SHIFT_CHANGES: readonly RedraftChange[] = [
  ...CHANGES.slice(0, 2),
  {
    op: 'retime',
    stable_id: 'i-tea',
    before: snap('p-tea', '15:00'),
    after: snap('p-tea', '15:20'),
    reason: null,
  },
  {
    op: 'retime',
    stable_id: 'i-boat2',
    before: snap('p-boat', '16:00'),
    after: snap('p-boat', '16:15'),
    reason: null,
  },
];

export const METRICS: RedraftMetrics = {
  transit_delta_min: -90,
  active_delta_min: 0,
  pace: 'same',
  must_dos_kept: 5,
  must_dos_total: 5,
  cost_delta_pp_minor: 0,
  currency: 'USD',
};
