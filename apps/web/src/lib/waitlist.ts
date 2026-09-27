/* eslint-disable lingui/no-unlocalized-strings -- destination keys/city labels are data, not JSX. */
/**
 * Pure waitlist math: queue numbers, first-wave progress and a joiner's place in line.
 *
 * `WAITLIST_BASE_COUNT` is the founder-set head start applied on top of every real sign-up so the
 * page never shows an empty room. `FIRST_WAVE_TOTAL` is the number of seats the first wave holds.
 */
export const WAITLIST_BASE_COUNT = 500;
export const FIRST_WAVE_TOTAL = 5000;

/** Spots a successful referral moves the referrer up, never below `WAITLIST_BASE_COUNT + 1`. */
const REFERRAL_BOOST = 100;

export interface Destination {
  readonly key: string;
  readonly city: string;
  readonly kind: string;
  readonly seed: number;
}

/** The six first-destination chips, in the design's own order (`guides` in the coming-soon script). */
export const DESTINATIONS: readonly Destination[] = [
  { key: 'bali', city: 'BALI', kind: 'gecko', seed: 41 },
  { key: 'kyoto', city: 'KYOTO', kind: 'tanuki', seed: 51 },
  { key: 'iceland', city: 'ICELAND', kind: 'puffin', seed: 43 },
  { key: 'mexico-city', city: 'MEXICO CITY', kind: 'axolotl', seed: 44 },
  { key: 'lisbon', city: 'LISBON', kind: 'sardine', seed: 45 },
  { key: 'cusco', city: 'CUSCO', kind: 'alpaca', seed: 46 },
];

const FIRST_DESTINATION = DESTINATIONS[0];
if (!FIRST_DESTINATION) throw new Error('waitlist: DESTINATIONS must not be empty');
/** The chip selected before a visitor picks one themselves. */
export const DEFAULT_DESTINATION: Destination = FIRST_DESTINATION;

export function isDestinationKey(value: string): boolean {
  return DESTINATIONS.some((destination) => destination.key === value);
}

export function findDestination(key: string): Destination | undefined {
  return DESTINATIONS.find((destination) => destination.key === key);
}

/** Total shown in the header chip / progress bar: base plus every real sign-up. */
export function queueCount(realSignups: number): number {
  return WAITLIST_BASE_COUNT + realSignups;
}

export function firstWaveSeatsLeft(realSignups: number): number {
  return Math.max(0, FIRST_WAVE_TOTAL - queueCount(realSignups));
}

export function firstWavePercent(realSignups: number): number {
  return Math.min(100, Math.round((queueCount(realSignups) / FIRST_WAVE_TOTAL) * 100));
}

/**
 * A joiner's place in line: base + their real rank (1-indexed, by join order), moved up 100 spots
 * per friend who joined through their link, never below `WAITLIST_BASE_COUNT + 1`.
 */
export function positionInLine(rank: number, referralsCount: number): number {
  const boosted = WAITLIST_BASE_COUNT + rank - referralsCount * REFERRAL_BOOST;
  return Math.max(WAITLIST_BASE_COUNT + 1, boosted);
}
