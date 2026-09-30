/**
 * Published ride tariffs for the guide destinations, researched by hand from regulators' and
 * operators' own pages; every figure carries the page it came from and the day it was checked.
 * Where no page publishes a figure, the class is left out rather than guessed:
 *
 * - Bali has no published Blue Bird meter tariff (only travel blogs quote one).
 * - Kyoto's ride-hail apps dispatch metered taxis, so their fare is the meter's.
 * - Lisbon's Uber and Bolt publish no fare table; only blogs estimate one.
 * - Mexico City's meter tariff is quoted two ways in the press (MXN 1.07 or 1.30 per 250 m) and the
 *   SEMOVI page did not answer when checked; Uber publishes no fare table there.
 * - Iceland has no ride-hail service.
 * - Cusco's taxis are unmetered and negotiated; Uber publishes no fare table there.
 */
import type { RideTariffItem } from '@cp/content';

import { DA_NANG_RIDE_TARIFFS } from './records-da-nang';

const CHECKED = '2026-09-30';

const KATADATA_RIDE_HAIL =
  'https://katadata.co.id/digital/startup/6863a5d9714bd/aturan-lengkap-tarif-ojol-dan-taksi-online-antar-penumpang-makanan-barang';

export const RIDE_TARIFF_RECORDS: readonly RideTariffItem[] = [
  {
    id: 'bali:ride_hail_car',
    destination: 'bali',
    ride_class: 'ride_hail_car',
    operator: 'Indonesian Ministry of Transportation, zone I band',
    currency: 'IDR',
    basis: 'regulated_band',
    standard: {
      base_fare: 0,
      included_km: 0,
      per_km: 3500,
      later: null,
      per_min: null,
      minimum_fare: null,
    },
    upper: {
      base_fare: 0,
      included_km: 0,
      per_km: 6000,
      later: null,
      per_min: null,
      minimum_fare: null,
    },
    time_charge: 'whole_trip',
    extras: [],
    round_to: 1000,
    sources: [
      {
        url: KATADATA_RIDE_HAIL,
        covers:
          'Taksi online zone I (Java, Bali, Sumatra): Rp3,500 lower and Rp6,000 upper per km (Permenhub PM 118/2018); no minimum fare given',
        checked_on: CHECKED,
      },
    ],
  },
  {
    id: 'bali:ride_hail_bike',
    destination: 'bali',
    ride_class: 'ride_hail_bike',
    operator: 'Indonesian Ministry of Transportation, zone I band',
    currency: 'IDR',
    basis: 'regulated_band',
    standard: {
      base_fare: 8000,
      included_km: 4,
      per_km: 2000,
      later: null,
      per_min: null,
      minimum_fare: 8000,
    },
    upper: {
      base_fare: 10000,
      included_km: 4,
      per_km: 2500,
      later: null,
      per_min: null,
      minimum_fare: 10000,
    },
    time_charge: 'whole_trip',
    extras: [],
    round_to: 1000,
    sources: [
      {
        url: KATADATA_RIDE_HAIL,
        covers:
          'Ojek online zone I: Rp2,000 lower and Rp2,500 upper per km; minimum Rp8,000 to Rp10,000 for the first 4 km (Kepmenhub KP 667/2022)',
        checked_on: CHECKED,
      },
    ],
  },
  {
    id: 'kyoto:metered_taxi',
    destination: 'kyoto',
    ride_class: 'metered_taxi',
    operator: 'MK Taxi Kyoto',
    currency: 'JPY',
    basis: 'meter_tariff',
    // ¥100 per 271 m and ¥100 per 1 min 40 s, per km and per minute.
    standard: {
      base_fare: 470,
      included_km: 0.9,
      per_km: 369.0037,
      later: null,
      per_min: 60,
      minimum_fare: null,
    },
    // 22:00 to 05:00: 20% on every part of the fare.
    upper: {
      base_fare: 564,
      included_km: 0.9,
      per_km: 442.8044,
      later: null,
      per_min: 72,
      minimum_fare: null,
    },
    time_charge: 'slow_traffic',
    extras: [{ kind: 'dispatch', amount: 300 }],
    round_to: 10,
    sources: [
      {
        url: 'https://www.mk-group.co.jp/kyoto/taxi/',
        covers:
          '普通車 ¥470 to 0.9 km, ¥100 per 271 m, ¥100 per 1 min 40 s at 10 km/h or slower, ¥300 dispatch, 20% more 22:00 to 05:00 (as of 21 June 2026)',
        checked_on: CHECKED,
      },
    ],
  },
  {
    id: 'lisbon:metered_taxi',
    destination: 'lisbon',
    ride_class: 'metered_taxi',
    operator: 'Portuguese taxi reference tariff (AMT)',
    currency: 'EUR',
    basis: 'meter_tariff',
    standard: {
      base_fare: 2,
      included_km: 0,
      per_km: 0.58,
      later: null,
      per_min: 0.28,
      minimum_fare: null,
    },
    upper: null,
    time_charge: 'whole_trip',
    extras: [{ kind: 'dispatch', amount: 0.8 }],
    round_to: 0.5,
    sources: [
      {
        url: 'https://www.antral.pt/noticias/publicado-regulamento-que-define-as-novas-regras-de-formacao-dos-precos-no-servico-de-taxi/',
        covers:
          'Regulamento 717/2026, taxis up to 4 seats: flag drop €2.00; first-year transitional €0.58 per km and €0.28 per minute (weekday daytime); €0.80 for booking by phone, radio or app',
        checked_on: CHECKED,
      },
    ],
  },
  {
    id: 'iceland:metered_taxi',
    destination: 'iceland',
    ride_class: 'metered_taxi',
    operator: 'Hreyfill',
    currency: 'ISK',
    basis: 'meter_tariff',
    // Weekdays 08:00 to 16:00, four passengers.
    standard: {
      base_fare: 880,
      included_km: 0,
      per_km: 477,
      later: { from_km: 4, per_km: 364 },
      per_min: 198,
      minimum_fare: null,
    },
    // Nights and weekends, four passengers.
    upper: {
      base_fare: 880,
      included_km: 0,
      per_km: 564,
      later: { from_km: 4, per_km: 452 },
      per_min: 247,
      minimum_fare: null,
    },
    time_charge: 'slow_traffic',
    extras: [{ kind: 'airport_pickup', amount: 490 }],
    round_to: 100,
    sources: [
      {
        url: 'https://www.hreyfill.is/en/prices/',
        covers:
          'Valid from 18 March 2026: start 880 kr, 477 kr per km for the first 4 km then 364 kr (nights and weekends 564 and 452 kr), 198 kr (247 kr) per minute waiting, 490 kr on trips from Keflavik airport',
        checked_on: CHECKED,
      },
    ],
  },
  ...DA_NANG_RIDE_TARIFFS,
];
