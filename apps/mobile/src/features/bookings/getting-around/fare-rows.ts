/**
 * Our tariff estimate as ride-card rows (only when Grab gave no estimate): per ride class and
 * operator, "About {low}–{high} · estimate" in the local currency, the crew-currency range under
 * it, and each extra (airport pickup, dispatch) on its own line, never folded into the range.
 */
import {
  ALL_PARTNERS_OFF,
  supplierCopy,
  type RideFareEstimate,
  type RideFareEstimateOption,
} from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { price } from '../format';
import type { useSupplierCopy } from '../supplier/copy';

export interface FareRow {
  readonly key: string;
  readonly label: string;
  readonly line: string;
  readonly crew: string | null;
  readonly extras: readonly string[];
  readonly onWhy: () => void;
}

export interface FareRowDeps {
  readonly tr: (descriptor: MessageDescriptor) => string;
  readonly render: ReturnType<typeof useSupplierCopy>;
  readonly locale: string;
  readonly onWhy: (option: RideFareEstimateOption) => void;
}

export function rideClassLabel(
  tr: FareRowDeps['tr'],
  rideClass: RideFareEstimateOption['ride_class'],
): string {
  return rideClass === 'metered_taxi'
    ? tr(msg({ id: 'suppliers.fare.taxi', message: 'Metered taxi' }))
    : rideClass === 'ride_hail_car'
      ? tr(msg({ id: 'suppliers.fare.car', message: 'Ride-hail car' }))
      : tr(msg({ id: 'suppliers.fare.bike', message: 'Ride-hail bike' }));
}

export function fareRows(estimate: RideFareEstimate | null, deps: FareRowDeps): FareRow[] {
  if (estimate === null) return [];
  const { tr, render, locale } = deps;
  return estimate.options.map((option, index) => {
    const range = (low: number, high: number, currency: string) => ({
      low: price(locale, low, currency),
      high: price(locale, high, currency),
    });
    const local = range(option.low_minor, option.high_minor, option.currency);
    const crew = option.crew
      ? range(option.crew.low_minor, option.crew.high_minor, option.crew.currency)
      : null;
    const operator = option.operator;
    const label = `${operator} · ${rideClassLabel(tr, option.ride_class)}`;
    return {
      key: `${option.ride_class}-${index}`,
      label,
      line: render(supplierCopy({ action: 'ride', state: 'tariff', ...local }, ALL_PARTNERS_OFF)),
      crew: crew
        ? tr(
            msg({
              id: 'suppliers.fare.crew',
              message: `≈ ${crew.low}–${crew.high} in the crew’s currency`,
            }),
          )
        : null,
      extras: option.extras.map((extra) => {
        const fee = price(locale, extra.amount_minor, option.currency);
        return extra.kind === 'airport_pickup'
          ? tr(msg({ id: 'suppliers.fare.airport', message: `+ ${fee} airport pickup fee` }))
          : tr(
              msg({
                id: 'suppliers.fare.dispatch',
                message: `+ ${fee} if you book by phone or app`,
              }),
            );
      }),
      onWhy: () => deps.onWhy(option),
    };
  });
}
