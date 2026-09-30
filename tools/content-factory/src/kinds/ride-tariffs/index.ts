/**
 * Ride tariffs: the published fares behind the ride quote's estimate, one record per ride class a
 * guide destination has. Built without a model: the records are researched by hand from regulators'
 * and operators' pages (./records.ts), and the owner checks each against its source in the console
 * before the batch publishes. Until then the api serves them flagged unreviewed.
 */
import { rideTariffItemSchema } from '@cp/content';

import { checklistTable } from '../emergency/sources';
import { registerKind } from '../registry';
import type { KindModule } from '../types';
import { RIDE_TARIFF_RECORDS } from './records';

/** The guide destinations a tariff can belong to. */
export const GUIDE_DESTINATIONS = [
  'bali',
  'cusco',
  'da-nang',
  'iceland',
  'kyoto',
  'lisbon',
  'mexico-city',
];

const DAY_MS = 86_400_000;

export const rideTariffsKind: KindModule<'ride_tariffs'> = {
  kind: 'ride_tariffs',
  title: () => 'Ride tariffs · guide destinations',
  gate: 'record_verification',
  brief: () =>
    Promise.resolve({
      units: RIDE_TARIFF_RECORDS.map((record) => ({ id: record.id, input: record })),
    }),
  assemble: (_ctx, brief) =>
    Promise.resolve(brief.units.map((unit) => rideTariffItemSchema.parse(unit.input))),
  validators: {
    items: [
      {
        id: 'guide-destination',
        severity: 'fail',
        check: (item) =>
          GUIDE_DESTINATIONS.includes(item.destination)
            ? []
            : [`${item.destination} is not a guide destination`],
      },
      {
        id: 'recently-checked',
        severity: 'warn',
        check: (item) =>
          item.sources
            .filter((s) => Date.now() - Date.parse(s.checked_on) > 180 * DAY_MS)
            .map((s) => `${s.url} was last checked on ${s.checked_on}; check it again`),
      },
    ],
    batch: [
      {
        id: 'every-destination',
        severity: 'warn',
        check: ({ items }) => {
          const have = new Set(items.map((i) => i.destination));
          return GUIDE_DESTINATIONS.filter((d) => !have.has(d)).map((d) => ({
            ref: null,
            message: `${d} has no published tariff yet; its rides show links and the phrase card only`,
          }));
        },
      },
    ],
  },
  checklist: (ctx, items) =>
    checklistTable(
      `Ride tariffs · ${ctx.batchKey}`,
      items.map((i) => [
        i.id,
        `${i.currency} ${i.standard.base_fare} + ${i.standard.per_km}/km${i.standard.per_min === null ? '' : ` + ${i.standard.per_min}/min`}${i.upper === null ? '' : ` (upper ${i.upper.base_fare} + ${i.upper.per_km}/km)`}`,
        i.sources.map((s) => s.url).join(' '),
        i.sources.map((s) => s.checked_on).join(' '),
      ]),
      ['Tariff', 'Rates', 'Source', 'Checked'],
    ),
};

registerKind(rideTariffsKind);
