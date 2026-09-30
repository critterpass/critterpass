/**
 * Đà Nẵng's published ride tariffs. Grab publishes its per-city GrabCar and GrabBike rates (8% VAT
 * included) on its Vietnam service-information page, updated 8 July 2026. Left out because no
 * operator or regulator page publishes a figure (only blogs and booking sites quote one):
 *
 * - the metered taxis (Vinasun, Mai Linh, Tiên Sa): their sites list booking numbers and in-app
 *   fixed prices, not a meter tariff for Đà Nẵng;
 * - Xanh SM car and bike: fares are quoted in the app only.
 *
 * Grab charges its per-minute rate only after the first 2 km; the estimate applies it to the whole
 * trip, which adds a few thousand đồng at most.
 */
import type { RideTariffItem } from '@cp/content';

const CHECKED = '2026-09-30';

const GRAB_SERVICE_TABLE =
  'https://www.grab.com/vn/en/blog/bang-thong-tin-cac-dich-vu-tren-ung-dung-grab/';
const GRAB_VAT_TABLE = 'https://www.grab.com/vn/en/blog/driver/thongtindichvu/';

export const DA_NANG_RIDE_TARIFFS: readonly RideTariffItem[] = [
  {
    id: 'da-nang:ride_hail_car',
    destination: 'da-nang',
    ride_class: 'ride_hail_car',
    operator: 'Grab (GrabCar, 4 seats)',
    currency: 'VND',
    basis: 'operator_rates',
    standard: {
      base_fare: 27000,
      included_km: 2,
      per_km: 12175,
      later: null,
      per_min: 442,
      minimum_fare: null,
    },
    upper: null,
    time_charge: 'whole_trip',
    extras: [],
    round_to: 1000,
    sources: [
      {
        url: GRAB_SERVICE_TABLE,
        covers:
          'Đà Nẵng GrabCar: 27,000đ for the first 2 km, then 12,175đ per km and 442đ per minute after the first 2 km (updated 8 July 2026)',
        checked_on: CHECKED,
      },
      {
        url: GRAB_VAT_TABLE,
        covers:
          'Same Đà Nẵng GrabCar figures with 8% VAT, valid 1 July 2025 to 31 December 2026; GrabCar 6 seats 33,382đ, 14,335đ per km, 864đ per minute',
        checked_on: CHECKED,
      },
    ],
  },
  {
    id: 'da-nang:ride_hail_bike',
    destination: 'da-nang',
    ride_class: 'ride_hail_bike',
    operator: 'Grab (GrabBike)',
    currency: 'VND',
    basis: 'operator_rates',
    standard: {
      base_fare: 12273,
      included_km: 2,
      per_km: 4222,
      later: null,
      per_min: 344,
      minimum_fare: null,
    },
    upper: null,
    time_charge: 'whole_trip',
    extras: [],
    round_to: 1000,
    sources: [
      {
        url: GRAB_SERVICE_TABLE,
        covers:
          'Đà Nẵng GrabBike: 12,273đ for the first 2 km, then 4,222đ per km and 344đ per minute after the first 2 km (updated 8 July 2026)',
        checked_on: CHECKED,
      },
    ],
  },
];
