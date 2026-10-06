/**
 * Scene data for the drivers lab (Developer tools): the designed directory, detail, empty, rate,
 * invite and our-drivers states with the names and numbers the renders show. Never imported by a
 * release screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data, never copy. */
import type { DriverDirectoryCard, DriverDirectoryDetail, OurDriver } from '@cp/domain';

const listed = '2025-03-01T00:00:00Z';

export const LAB_DIRECTORY: readonly DriverDirectoryCard[] = [
  {
    id: '00000000-0000-7000-8000-00000000d001',
    display_name: 'Komang Adi',
    areas: ['Ubud', 'Sidemen'],
    languages: ['English', 'Bahasa Indonesia', 'Japanese'],
    vehicle: { model: 'Toyota HiAce', seats: 10 },
    seats: 10,
    day_trips: true,
    photo_url: null,
    listed_at: listed,
    crews_loved: 6,
    crews_rated: 7,
    trips: 23,
    top_tags: ['on_time', 'knew_the_spots', 'safe_driver'],
  },
  {
    id: '00000000-0000-7000-8000-00000000d002',
    display_name: 'Nyoman',
    areas: ['Ubud', 'Tegallalang'],
    languages: ['English', 'Bahasa Indonesia'],
    vehicle: { model: 'Toyota Innova', seats: 6 },
    seats: 6,
    day_trips: true,
    photo_url: null,
    listed_at: listed,
    crews_loved: 4,
    crews_rated: 4,
    trips: 11,
    top_tags: ['patient', 'great_photos'],
  },
  {
    id: '00000000-0000-7000-8000-00000000d003',
    display_name: 'Putu',
    areas: ['Ubud', 'Airport'],
    languages: ['English', 'Bahasa Indonesia'],
    vehicle: { model: 'Mitsubishi Xpander', seats: 6 },
    seats: 6,
    day_trips: false,
    photo_url: null,
    listed_at: listed,
    crews_loved: 3,
    crews_rated: 5,
    trips: 9,
    top_tags: ['fair_price', 'new_car'],
  },
];

export const LAB_DETAIL: DriverDirectoryDetail = {
  ...(LAB_DIRECTORY[0] as DriverDirectoryCard),
  price_text: 'Rp 900k a day, fuel, parking, tolls',
  phone_e164: '+6281234567890',
  tip: {
    id: '00000000-0000-7000-8000-00000000e001',
    text: "He took us to his cousin's warung. Best babi guling of the trip.",
    crew_size: 4,
    month: '2026-08-01',
  },
};

export const LAB_OURS: readonly OurDriver[] = [
  {
    provider_id: '00000000-0000-7000-8000-00000000f001',
    name: 'Made',
    day_numbers: [3, 7],
    crew_loved: 6,
    crew_voters: 6,
    my_verdict: 'loved',
    listing_id: null,
    listing_status: null,
    invite: {
      id: '00000000-0000-7000-8000-00000000a001',
      status: 'opened',
      sent_at: '2026-10-20T09:00:00Z',
      opened_at: '2026-10-21T09:00:00Z',
      expires_at: '2026-11-20T09:00:00Z',
      nudged_at: null,
    },
  },
  {
    provider_id: '00000000-0000-7000-8000-00000000f002',
    name: 'Ketut',
    day_numbers: [4],
    crew_loved: 5,
    crew_voters: 6,
    my_verdict: 'loved',
    listing_id: '00000000-0000-7000-8000-00000000d004',
    listing_status: 'listed',
    invite: null,
  },
];
