/**
 * Đà Nẵng as the curated set holds it: no must-see flags, hundreds of places tied on score, the
 * famous ones listed several times under Vietnamese and English names, some with a stray pin, and
 * a famous place (Bà Nà Hills) that only the open-data rows know.
 */
import type { DraftPoi, TripFrame } from '../../src/draft/index';

export const id = (n: number) => `0199b000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const TZ = 'Asia/Ho_Chi_Minh';

function place(
  n: number,
  name: string,
  category: string,
  lat: number,
  lng: number,
  extra: Partial<DraftPoi> = {},
): DraftPoi {
  return {
    id: id(n),
    name,
    category,
    lat,
    lng,
    tz: TZ,
    hours: null,
    priceLevel: null,
    tags: [],
    durationMin: category === 'food' ? 60 : 90,
    editorial: true,
    mustSee: false,
    detail: 5,
    ...extra,
  };
}

export const D = {
  marble: place(101, 'Marble Mountains', 'temple_shrine', 16.0029, 108.2638),
  nguHanhSon: place(102, 'Ngũ Hành Sơn (Marble Mountain)', 'nature', 16.0034, 108.2644),
  marbleLift: place(103, 'Marble Mountains Elevator', 'museum', 16.0032, 108.2644),
  heavenGate: place(
    104,
    'Heavan Gate , Marble Mountain, Da Nang, Vietna',
    'nature',
    16.003,
    108.2645,
  ),
  linhUng: place(105, 'Chùa Linh Ứng (Linh Ung Pagoda)', 'temple_shrine', 16.0998, 108.2777),
  linhUngEn: place(106, 'Linh Ứng Pagoda', 'temple_shrine', 16.0996, 108.2775),
  // The same pagoda again, pinned at the Marble Mountains by mistake.
  linhUngSonTra: place(107, 'Chùa Linh Ứng – Sơn Trà', 'temple_shrine', 16.0041, 108.2643),
  haiVan1: place(108, 'Hai Van Pass', 'museum', 16.1877, 108.1313),
  haiVan2: place(109, 'Hải Vân Pass', 'museum', 16.1851, 108.1366),
  // A stray pin in the city.
  haiVan3: place(110, 'Hải Vân pass', 'nature', 16.0711, 108.2091),
  haiVanTop: place(111, 'Đỉnh đèo Hải Vân', 'nature', 16.1872, 108.1308),
  dragon: place(112, 'Dragon Bridge', 'other', 16.0611, 108.2277),
  cauRong: place(
    113,
    'Cầu Rồng, Cầu Quay Sông Hàn, Cầu Tình Yêu, Cầu Trần Thị Lý',
    'nature',
    16.0679,
    108.2248,
  ),
  eggCoffee: place(114, 'Cà Phê Trứng 3T - Cầu Rồng - Đà Nẵng', 'food', 16.0659, 108.2243),
  goldenBridge: place(115, 'Golden Bridge', 'other', 15.9947, 107.9966),
  cauVang: place(116, 'Cầu Vàng', 'museum', 15.9969, 107.9973),
  buddhaBaNa: place(117, 'Thích Ca Phật Đài - Bà Nà', 'temple_shrine', 15.9975, 107.994),
  myKhe: place(118, 'Bãi biển Mỹ Khê', 'beach', 16.0605, 108.2468),
  myKheEn: place(122, 'My Khe Beach', 'beach', 16.0607, 108.2466),
  hanMarket: place(119, 'Chợ Hàn (Han Market)', 'market', 16.0683, 108.2241),
  conMarket: place(120, 'Chợ Cồn (Con Market)', 'market', 16.0678, 108.2143),
  chamMuseum: place(121, 'Bảo tàng Điêu khắc Chăm', 'museum', 16.0604, 108.2234),
} as const;

/** Open-data rows: bare, noisy, and the only ones that know Bà Nà Hills. */
export const AUTO = {
  baNa: place(201, 'Bà Nà Hills', 'nature', 15.9972, 107.9888, { editorial: false, detail: 0 }),
  baNaEn: place(202, 'Ba Na Hills', 'nature', 16.0312, 108.1177, { editorial: false, detail: 0 }),
  baNaLong: place(203, 'Bà Nà Hill, Đà Nẵng, Việt Nam', 'other', 15.9977, 107.9877, {
    editorial: false,
    detail: 0,
  }),
  baNaBrew: place(204, 'Ba Na Brew House', 'nightlife', 15.9984, 107.9882, {
    editorial: false,
    detail: 0,
  }),
  landForSale: place(205, '500 Triệu Đất Nam Ngũ Hành Sơn Đà Nẵng', 'other', 15.9832, 108.2563, {
    editorial: false,
    detail: 0,
  }),
} as const;

/**
 * Curated filler: sixty bars and galleries in the few blocks of An Thượng, each with its own name,
 * all named so the alphabet would pick them first.
 */
export const AN_THUONG: readonly DraftPoi[] = Array.from({ length: 60 }, (_, index) =>
  place(
    300 + index,
    `Aa${String(index + 1).padStart(2, '0')} ${index % 2 === 0 ? 'Bar' : 'Gallery'}`,
    index % 2 === 0 ? 'nightlife' : 'museum',
    16.0495 + (index % 5) * 0.0004,
    108.2462 + (index % 7) * 0.0004,
  ),
);

export const CURATED: readonly DraftPoi[] = [...AN_THUONG, ...Object.values(D)];

export const IGNORE: readonly (readonly string[])[] = [
  ['da', 'nang'],
  ['vietnam'],
  ['viet', 'nam'],
];

export const FRAME: TripFrame = {
  tz: TZ,
  currency: 'VND',
  dates: ['2026-10-02', '2026-10-03', '2026-10-04'],
  members: [id(901)],
  chronotypes: {},
  diets: [],
  arrivalMin: null,
  departureMin: null,
  budgetPpMinor: null,
  mustDos: [],
  closures: [],
};
