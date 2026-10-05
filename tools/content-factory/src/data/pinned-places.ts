/**
 * Places each destination's curated set always holds (see kinds/places/pins.ts), by the name the
 * open data uses and a point at the real place. Đà Nẵng's list is the itinerary of the first crew
 * trip there (stay, day plans, airport) plus the city's landmarks and well-known local food.
 * Đà Lạt's list is the sights the landmark step does not reach and the town's cafés and food.
 * The lists of Bali and the five other guide cities, and the rest of Đà Nẵng's, are the must-sees a
 * corrections batch set by hand: a pin keeps the flag, and its `essential` tier, when the
 * destination's set is next generated.
 */
import type { PairRuling } from '../kinds/places/merges';
import type { LeftOutPlace, PinnedPlace } from '../kinds/places/pins';
import { BALI_PINS } from './places-bali';
import { CUSCO_PINS } from './places-cusco';
import { DA_LAT_PINS, DA_LAT_RULINGS } from './places-da-lat';
import { DA_NANG_SIGHTS } from './places-da-nang';
import { ICELAND_PINS } from './places-iceland';
import { KYOTO_PINS } from './places-kyoto';
import { LISBON_PINS } from './places-lisbon';
import { MEXICO_CITY_PINS } from './places-mexico-city';
import { DA_LAT_LEFT_OUT } from './places-da-lat-left-out';

export const PINNED_PLACES: Readonly<Record<string, readonly PinnedPlace[]>> = {
  'da-nang': [
    // Stay, arrival and departure.
    { name: 'Avatar Danang Hotel', lat: 16.0496, lng: 108.2472 },
    { name: 'Da Nang International Airport', lat: 16.0528, lng: 108.2029 },
    // Sơn Trà: the chessboard peak, Lady Buddha at Bãi Bụt and the Đồng Đình museum.
    { name: 'Bàn Cờ Peak', nameLocal: 'Đỉnh Bàn Cờ', lat: 16.1189, lng: 108.2721 },
    {
      name: 'Linh Ứng Pagoda (Lady Buddha)',
      essential: true,
      nameLocal: 'Chùa Linh Ứng',
      lat: 16.0996,
      lng: 108.2775,
    },
    { name: 'Bảo tàng Đồng Đình', lat: 16.0989, lng: 108.2759 },
    { name: 'Sơn Trà Peninsula', essential: true, lat: 16.1129, lng: 108.3093 },
    // City landmarks, beach and markets.
    { name: 'My Khe Beach', essential: true, lat: 16.0631, lng: 108.2459 },
    { name: 'Dragon Bridge', essential: true, lat: 16.0611, lng: 108.2277 },
    { name: 'Ngũ Hành Sơn (Marble Mountain)', lat: 16.0034, lng: 108.2644 },
    { name: 'Chợ Cồn (Con Market)', lat: 16.0683, lng: 108.2144 },
    { name: 'Chợ Hàn (Han Market)', essential: true, lat: 16.0683, lng: 108.224 },
    // Hội An.
    {
      name: 'Hội An Ancient Town',
      essential: true,
      nameLocal: 'Phố cổ Hội An',
      lat: 15.8794,
      lng: 108.3278,
    },
    { name: 'Chợ Hội An', lat: 15.8773, lng: 108.3312 },
    // Water.
    {
      name: 'Chèo SUP Đà Nẵng - Danang Stand Up Paddle Board Tours & Rentals',
      lat: 16.0884,
      lng: 108.2492,
    },
    // Local food and a beachside coffee.
    { name: 'Bánh Xèo Bà Dưỡng', lat: 16.0588, lng: 108.2161 },
    { name: 'Mì Quảng Bà Mua', lat: 16.066, lng: 108.2192 },
    { name: 'Bún Chả Cá Ông Tạ 113A Nguyễn Chí Thanh', lat: 16.0741, lng: 108.2208 },
    { name: 'Nhà hàng Madame Lân', lat: 16.0814, lng: 108.2233 },
    { name: 'Bếp Hên', lat: 16.064, lng: 108.221 },
    { name: 'Quán Bé Mặn', lat: 16.0829, lng: 108.2476 },
    { name: 'Hải Sản Năm Đảnh', lat: 16.1028, lng: 108.2527 },
    { name: 'Cộng Cà Phê', lat: 16.049, lng: 108.245 },
    { name: 'Beach Front Cafe', lat: 16.0564, lng: 108.2474 },
    ...DA_NANG_SIGHTS,
  ],
  bali: BALI_PINS,
  'mexico-city': MEXICO_CITY_PINS,
  cusco: CUSCO_PINS,
  kyoto: KYOTO_PINS,
  lisbon: LISBON_PINS,
  iceland: ICELAND_PINS,
  'vn-da-lat': DA_LAT_PINS,
};

/**
 * Records the curated set never takes (by open-data name and the record's own point), each with
 * the reason the review page shows: a point far from the real place, a second record of a place
 * the set already holds, or a seller rather than a place to visit.
 */
export const LEFT_OUT_PLACES: Readonly<Record<string, readonly LeftOutPlace[]>> = {
  'vn-da-lat': DA_LAT_LEFT_OUT,
};

/**
 * Pairs of curated records the duplicate decision left open, settled by hand: one place where a
 * street address or a Wikidata item says so, otherwise both are kept. The review page prints each.
 */
export const DUPLICATE_RULINGS: Readonly<Record<string, readonly PairRuling[]>> = {
  'vn-da-lat': DA_LAT_RULINGS,
};
