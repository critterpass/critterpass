/**
 * One crew, one trip, every number the design shows (vote → budget → draft → objection → dropout).
 * Demo inputs only: the goldens prove the engine's arithmetic is consistent, not vendor prices.
 * Crew of six: four fly from Singapore, one from Hong Kong, one from Kuala Lumpur. USD cents.
 */
import { money } from '../../src/money/money';
import { type CostComponent } from '../../src/quotes/quote-set';
import { type CostMember } from '../../src/shares/per-origin';

export const USD = 'USD' as const;
export const SEEN_AT = '2027-02-01T00:00:00.000Z';
export const FROZEN_AT = new Date('2027-02-02T09:00:00.000Z');

export const WINSTON = 'u-winston';
export const MAYA = 'u-maya';
export const ALEX = 'u-alex';
export const RIN = 'u-rin';
export const JORDAN = 'u-jordan';
export const DEV = 'u-dev';

export const CREW: readonly CostMember[] = [
  { uid: WINSTON, origin: 'SIN' },
  { uid: MAYA, origin: 'SIN' },
  { uid: ALEX, origin: 'SIN' },
  { uid: RIN, origin: 'SIN' },
  { uid: JORDAN, origin: 'HKG' },
  { uid: DEV, origin: 'KUL' },
];

function component(
  id: string,
  fields: Omit<CostComponent, 'id' | 'currency' | 'source' | 'seenAt'>,
): CostComponent {
  return { id, currency: USD, source: 'estimate', seenAt: SEEN_AT, ...fields };
}

function flights(prefix: string, fares: Record<string, [bigint, number]>): CostComponent[] {
  return Object.entries(fares).map(([origin, [amountMinor, durationMin]]) =>
    component(`${prefix}-flight-${origin}`, {
      kind: 'flight',
      unit: 'person',
      origin,
      amountMinor,
      durationMin,
    }),
  );
}

/** Everything but flights costs the same in both vote options: $960 each. */
function voteGround(prefix: string): CostComponent[] {
  return [
    component(`${prefix}-stay`, { kind: 'stay', unit: 'group', amountMinor: 360_000n }),
    component(`${prefix}-food`, { kind: 'food', unit: 'person', amountMinor: 22_000n }),
    component(`${prefix}-fun`, { kind: 'fun', unit: 'person', amountMinor: 14_000n }),
  ];
}

/** 3c-1: Kyoto $1,480 each vs Lisbon $1,920 each; Lisbon is $440 more for every origin. */
export const VOTE_KYOTO: readonly CostComponent[] = [
  ...flights('kyoto', { SIN: [52_000n, 420], HKG: [48_000n, 240], KUL: [56_000n, 450] }),
  ...voteGround('kyoto'),
];
export const VOTE_LISBON: readonly CostComponent[] = [
  ...flights('lisbon', { SIN: [96_000n, 1_020], HKG: [92_000n, 1_080], KUL: [100_000n, 1_050] }),
  ...voteGround('lisbon'),
];

export const dollars = (value: number) => money(BigInt(value) * 100n, USD);
