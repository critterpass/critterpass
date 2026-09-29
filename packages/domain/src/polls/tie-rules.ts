/**
 * Picking the winner at close. The most votes win; a tie goes by the poll's tie rule:
 *
 * - `cheaper_for_majority_origin` (destination final): the place whose frozen quote is cheaper for
 *   the crew's majority origin group wins, with the numbers the sentence needs ("A tie goes to
 *   Kyoto: it's $440 cheaper for the four flying from Singapore"). Prices come from quotes frozen
 *   when the place joined the vote (the cost engine), never from the model; without comparable
 *   quotes it falls back to the earliest to reach the count.
 * - `organiser_pick` (board advance): the organiser chooses among the tied places.
 * - `earliest_to_count` (everything else): the option whose last counted ballot came first.
 */
import type { PollTieRule } from './kinds';
import type { Tally, TallyBallot } from './tally';

export interface FrozenPrice {
  /** Per-person price for the majority origin group, in minor units. */
  readonly amountMinor: number;
  readonly currency: string;
}

export interface MajorityOrigin {
  /** IATA code of the most common home airport among the voters. */
  readonly origin: string;
  readonly memberCount: number;
}

export interface TieInput {
  readonly rule: PollTieRule;
  readonly tally: Tally;
  readonly ballots: readonly TallyBallot[];
  /** Options in board/position order, for stable fallbacks. */
  readonly optionOrder: readonly string[];
  readonly prices?: ReadonlyMap<string, FrozenPrice>;
  readonly majorityOrigin?: MajorityOrigin | null;
  /** The organiser's pick for an `organiser_pick` tie. */
  readonly pick?: string | null;
  /** Every live option counts as tied when nobody voted (a final that closes empty). */
  readonly emptyIsTie?: boolean;
}

export type TieBreak =
  | {
      readonly rule: 'cheaper_for_majority_origin';
      readonly winnerOptionId: string;
      readonly runnerUpOptionId: string;
      readonly origin: string;
      readonly memberCount: number;
      readonly cheaperByMinor: number;
      readonly currency: string;
    }
  | { readonly rule: 'organiser_pick'; readonly winnerOptionId: string }
  | { readonly rule: 'earliest_to_count'; readonly winnerOptionId: string };

export type WinnerResult =
  | { readonly outcome: 'winner'; readonly winnerOptionId: string; readonly tie: TieBreak | null }
  | { readonly outcome: 'no_votes' }
  | { readonly outcome: 'needs_pick'; readonly tiedOptionIds: readonly string[] };

function byOrder(order: readonly string[]) {
  return (a: string, b: string) => order.indexOf(a) - order.indexOf(b);
}

/** Among `tied`, the option whose count-reaching ballot was cast first. */
export function earliestToCount(input: TieInput, tied: readonly string[]): string {
  const top = input.tally.options.find((o) => o.optionId === tied[0])?.count ?? 0;
  const castAt = new Map(
    input.ballots.map((b) => [`${b.optionId}:${b.userId}`, b.castAt.getTime()]),
  );
  const reachedAt = (optionId: string): number => {
    if (top === 0) return 0;
    const voters = input.tally.options.find((o) => o.optionId === optionId)?.voterIds ?? [];
    const uid = voters[top - 1];
    return uid === undefined ? Number.POSITIVE_INFINITY : (castAt.get(`${optionId}:${uid}`) ?? 0);
  };
  const order = byOrder(input.optionOrder);
  return [...tied].sort((a, b) => reachedAt(a) - reachedAt(b) || order(a, b))[0] as string;
}

/** The cheaper tied option for the majority origin, or `null` when prices cannot decide. */
export function cheaperForMajority(input: TieInput, tied: readonly string[]): TieBreak | null {
  const origin = input.majorityOrigin;
  if (origin === null || origin === undefined || input.prices === undefined) return null;
  const priced = tied.map((id) => ({ id, price: input.prices?.get(id) }));
  if (priced.some((p) => p.price === undefined)) return null;
  const currencies = new Set(priced.map((p) => p.price?.currency));
  if (currencies.size !== 1) return null;
  const order = byOrder(input.optionOrder);
  const sorted = priced.sort(
    (a, b) => (a.price?.amountMinor ?? 0) - (b.price?.amountMinor ?? 0) || order(a.id, b.id),
  );
  const [first, second] = sorted;
  if (first?.price === undefined || second?.price === undefined) return null;
  if (first.price.amountMinor === second.price.amountMinor) return null;
  return {
    rule: 'cheaper_for_majority_origin',
    winnerOptionId: first.id,
    runnerUpOptionId: second.id,
    origin: origin.origin,
    memberCount: origin.memberCount,
    cheaperByMinor: second.price.amountMinor - first.price.amountMinor,
    currency: first.price.currency,
  };
}

export function pickWinner(input: TieInput): WinnerResult {
  const tied =
    input.tally.leaderIds.length > 0
      ? [...input.tally.leaderIds]
      : input.emptyIsTie === true
        ? input.tally.options.map((o) => o.optionId)
        : [];
  if (tied.length === 0) return { outcome: 'no_votes' };
  if (tied.length === 1) return { outcome: 'winner', winnerOptionId: tied[0] as string, tie: null };
  switch (input.rule) {
    case 'cheaper_for_majority_origin': {
      const cheaper = cheaperForMajority(input, tied);
      if (cheaper !== null)
        return { outcome: 'winner', winnerOptionId: cheaper.winnerOptionId, tie: cheaper };
      break;
    }
    case 'organiser_pick': {
      const pick = input.pick ?? null;
      if (pick === null || !tied.includes(pick))
        return { outcome: 'needs_pick', tiedOptionIds: tied };
      return {
        outcome: 'winner',
        winnerOptionId: pick,
        tie: { rule: 'organiser_pick', winnerOptionId: pick },
      };
    }
    case 'earliest_to_count':
      break;
  }
  const winner = earliestToCount(input, tied);
  return {
    outcome: 'winner',
    winnerOptionId: winner,
    tie: { rule: 'earliest_to_count', winnerOptionId: winner },
  };
}

/**
 * The two places a board advances with: the top two by votes. A tie for a final spot is the
 * organiser's pick (`pick` = the ids they chose); ties for first with two places are fine.
 */
export type FinalistsResult =
  | { readonly outcome: 'finalists'; readonly optionIds: readonly [string, string] }
  | {
      readonly outcome: 'needs_pick';
      readonly tiedOptionIds: readonly string[];
      readonly settled: readonly string[];
    }
  | { readonly outcome: 'too_few' };

export function pickFinalists(
  tally: Tally,
  optionOrder: readonly string[],
  pick?: readonly string[],
): FinalistsResult {
  const order = byOrder(optionOrder);
  const ranked = [...tally.options].sort(
    (a, b) => b.count - a.count || order(a.optionId, b.optionId),
  );
  const [first, runnerUp] = ranked;
  if (first === undefined || runnerUp === undefined) return { outcome: 'too_few' };
  if (ranked.length === 2) {
    return { outcome: 'finalists', optionIds: [first.optionId, runnerUp.optionId] };
  }
  const second = runnerUp.count;
  const settled = ranked.filter((o) => o.count > second).map((o) => o.optionId);
  const contested = ranked.filter((o) => o.count === second).map((o) => o.optionId);
  const openSpots = 2 - settled.length;
  if (contested.length <= openSpots) {
    return {
      outcome: 'finalists',
      optionIds: [...settled, ...contested].slice(0, 2) as [string, string],
    };
  }
  const picked = (pick ?? []).filter((id) => contested.includes(id));
  if (picked.length === openSpots) {
    return {
      outcome: 'finalists',
      optionIds: [...settled, ...picked] as unknown as [string, string],
    };
  }
  return { outcome: 'needs_pick', tiedOptionIds: contested, settled };
}

/**
 * The most common known home airport among the voters (ties: alphabetically first), with how many
 * fly from it; the same rule as the cost engine's `majorityOrigin`.
 */
export function majorityOriginOf(homeAirports: readonly (string | null)[]): MajorityOrigin | null {
  const counts = new Map<string, number>();
  for (const code of homeAirports) if (code !== null) counts.set(code, (counts.get(code) ?? 0) + 1);
  let best: MajorityOrigin | null = null;
  for (const [origin, memberCount] of [...counts].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (best === null || memberCount > best.memberCount) best = { origin, memberCount };
  }
  return best;
}
