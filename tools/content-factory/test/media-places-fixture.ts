/**
 * Curated Đà Nẵng places from the committed places batch for the place-photo tests: landmarks
 * with a Wikidata image, and names that must not take a landmark's photo (a café named after the
 * Dragon Bridge, a tailor in Hội An, a pagoda and a cave on the Marble Mountains).
 */
import type { MediaPlace } from '../src/kinds/media/places';

const place = (
  ref: string,
  name: string,
  category: string,
  lat: number,
  lng: number,
): MediaPlace => ({ ref, destination: 'da-nang', name, category, lat, lng });

export const LINH_UNG = place(
  'fsq_os:4d5cfd269895b1f725f8ea0f',
  'Chùa Linh Ứng (Linh Ung Pagoda)',
  'temple_shrine',
  16.099820272931275,
  108.27767694867337,
);
export const MY_KHE = place(
  'overture:6eb596b4-7e24-458a-8b4f-c9514d9a7889',
  'My Khe Beach',
  'beach',
  16.06306457519531,
  108.24594116210938,
);
export const MARBLE = place(
  'fsq_os:4cae95fdc5e6a1cdc163c6f6',
  'Ngũ Hành Sơn (Marble Mountain)',
  'nature',
  16.00341974130087,
  108.26435936551864,
);
export const CATHEDRAL = place(
  'fsq_os:4c26198a136d20a14ba5e461',
  'Nhà thờ Chính Tòa Đà Nẵng (Da Nang Cathedral)',
  'temple_shrine',
  16.06672442722388,
  108.22345916233328,
);
export const EGG_CAFE = place(
  'overture:878c01c6-e79a-40b1-b74e-a26578bbaf5b',
  'Cà Phê Trứng 3T - Cầu Rồng - Đà Nẵng',
  'food',
  16.065887451171875,
  108.22432708740234,
);
export const TAILOR = place(
  'overture:f0e02216-2d20-44fe-96c0-8ed38330efb9',
  'A Dong Silk Hoi An Tailor - Custom Suits',
  'other',
  15.88011360168457,
  108.32699584960938,
);
export const NON_NUOC_PAGODA = place(
  'overture:87b5d96a-ff85-4df6-b873-0146f8494fd6',
  'Chùa Non Nước , Ngũ Hành Sơn, Đà Nẵng',
  'museum',
  16.00327491760254,
  108.26405334472656,
);
export const VAN_THONG_CAVE = place(
  'overture:390358e6-fc2a-4209-a4df-ce02a2a8839c',
  'Van Thong cave - Ngu Hanh Son Mountain',
  'nature',
  16.00397491455078,
  108.26338195800781,
);

export const FIXTURE_PLACES: readonly MediaPlace[] = [
  LINH_UNG,
  MY_KHE,
  MARBLE,
  CATHEDRAL,
  EGG_CAFE,
  TAILOR,
  NON_NUOC_PAGODA,
  VAN_THONG_CAVE,
];
