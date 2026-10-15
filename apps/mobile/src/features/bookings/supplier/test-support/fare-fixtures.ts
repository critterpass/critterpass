/** A Kyoto taxi fare estimate (MK Taxi, dispatch extra) for the lab, as `/v1/rides/quote` sends it. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { RideFareEstimate } from '@cp/domain';

export const KYOTO_TAXI_ESTIMATE: RideFareEstimate = {
  copy_key: 'suppliers.rides.tariff_estimate',
  distance_m: 9400,
  duration_min: 28,
  traffic: true,
  options: [
    {
      ride_class: 'metered_taxi',
      operator: 'MK Taxi',
      low_minor: 3400,
      high_minor: 4300,
      currency: 'JPY',
      basis: 'meter_tariff',
      peak_factor: null,
      minimum_applied: false,
      extras: [{ kind: 'dispatch', amount_minor: 420 }],
      crew: {
        low_minor: 2300,
        high_minor: 2900,
        currency: 'USD',
        fx_as_of: '2026-09-30',
        fx_stale: false,
      },
      sources: [
        {
          url: 'https://www.mk-group.co.jp/en/taxi/fare/',
          covers: 'MK Taxi fares, Kyoto city',
          checked_on: '2026-09-30',
        },
        {
          url: 'https://www.mk-group.co.jp/en/taxi/',
          covers: 'MK Taxi dispatch fee',
          checked_on: '2026-09-30',
        },
      ],
      checked_at: '2026-09-30',
      reviewed: false,
    },
  ],
};
