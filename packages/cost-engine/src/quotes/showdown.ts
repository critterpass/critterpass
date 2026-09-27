/**
 * Vote showdown (3c-1): each option's "each" figure and flight time, and the tie rule. On a tie the
 * option that is cheaper for the crew's majority origin group wins, on frozen quotes only, and the
 * result carries the numbers the copy needs ("$440 cheaper for the four flying from Singapore").
 */
import { DomainError } from '@cp/domain';

import { roundEach, roundedMean } from '../display/round';
import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { computeShares, type MemberShare } from '../shares/allocate';
import { type FxContext } from '../shares/fx';
import { majorityOrigin, resolveOrigins, type CostMember } from '../shares/per-origin';
import { assertFrozen } from './freeze';
import { type QuoteSet } from './quote-set';

export interface ShowdownOption {
  readonly id: string;
  readonly quotes: QuoteSet;
}

export interface ShowdownInput {
  readonly currency: CurrencyCode;
  readonly members: readonly CostMember[];
  readonly options: readonly ShowdownOption[];
  /** Ballot counts by option id; options without an entry have none. */
  readonly votes?: Readonly<Record<string, number>>;
  readonly viewerUid?: string;
  readonly fx?: FxContext;
}

export interface ShowdownOptionResult {
  readonly optionId: string;
  /** Rounded crew mean. */
  readonly crewEach: Money;
  /** Rounded viewer share; `null` without a viewer or when the viewer's origin is estimated. */
  readonly viewerEach: Money | null;
  /** What the card shows: the viewer's own share when known, the crew mean otherwise. */
  readonly each: Money;
  readonly eachBasis: 'viewer' | 'crew';
  /** Viewer's (or majority origin's) flight minutes, when the set has a duration for it. */
  readonly flightMinutes: number | null;
  /** Some price is missing, so the figure is a lower bound ("~"). */
  readonly approximate: boolean;
}

export type TieBreak =
  | {
      readonly rule: 'majority_origin';
      readonly winnerId: string;
      readonly runnerUpId: string;
      readonly origin: string;
      readonly memberCount: number;
      /** Rounded per-person saving for that group. */
      readonly cheaperByEach: Money;
    }
  | {
      readonly rule: 'crew_mean';
      readonly winnerId: string;
      readonly runnerUpId: string;
      readonly cheaperByEach: Money;
    }
  | { readonly rule: 'undecided' };

export interface ShowdownResult {
  readonly options: readonly ShowdownOptionResult[];
  /** The winning option, by votes or by the tie rule; `null` when still undecided. */
  readonly winnerId: string | null;
  readonly tieBreak: TieBreak | null;
}

interface Priced {
  readonly id: string;
  readonly shares: readonly MemberShare[];
}

function priceOption(input: ShowdownInput, option: ShowdownOption): Priced {
  const calc = computeShares({
    currency: input.currency,
    members: input.members,
    components: option.quotes.components,
    ...(input.fx ? { fx: input.fx } : {}),
  });
  return { id: option.id, shares: calc.status === 'ok' ? calc.members : [] };
}

function groupEach(priced: Priced, uids: ReadonlySet<string>, currency: CurrencyCode): Money {
  return roundedMean(
    priced.shares.filter((s) => uids.has(s.uid)).map((s) => s.totalMinor),
    currency,
  );
}

function optionResult(input: ShowdownInput, option: ShowdownOption, priced: Priced) {
  const resolved = resolveOrigins(input.members);
  const viewer = resolved.find((m) => m.uid === input.viewerUid);
  const viewerShare = priced.shares.find((s) => s.uid === input.viewerUid);
  const viewerEach =
    viewer && !viewer.estimatedOrigin && viewerShare
      ? roundEach({ amountMinor: viewerShare.totalMinor, currency: input.currency })
      : null;
  const crewEach = roundedMean(
    priced.shares.map((s) => s.totalMinor),
    input.currency,
  );
  const origin = viewer?.origin ?? majorityOrigin(input.members);
  const flight = option.quotes.components.find(
    (c) => c.kind === 'flight' && c.origin === origin && c.durationMin !== undefined,
  );
  return {
    optionId: option.id,
    crewEach,
    viewerEach,
    each: viewerEach ?? crewEach,
    eachBasis: viewerEach ? ('viewer' as const) : ('crew' as const),
    flightMinutes: flight?.durationMin ?? null,
    approximate: priced.shares.some((s) => s.missing),
  };
}

function breakTie(input: ShowdownInput, tied: readonly Priced[]): TieBreak {
  assertFrozen(input.options.filter((o) => tied.some((t) => t.id === o.id)).map((o) => o.quotes));
  const origin = majorityOrigin(input.members);
  const rankBy = (uids: ReadonlySet<string>) =>
    tied
      .map((priced) => ({ id: priced.id, each: groupEach(priced, uids, input.currency) }))
      .sort((a, b) =>
        a.each.amountMinor === b.each.amountMinor
          ? a.id < b.id
            ? -1
            : 1
          : a.each.amountMinor < b.each.amountMinor
            ? -1
            : 1,
      );
  if (origin !== null) {
    const group = new Set(input.members.filter((m) => m.origin === origin).map((m) => m.uid));
    const [first, second] = rankBy(group);
    if (first && second && first.each.amountMinor < second.each.amountMinor) {
      return {
        rule: 'majority_origin',
        winnerId: first.id,
        runnerUpId: second.id,
        origin,
        memberCount: group.size,
        cheaperByEach: {
          amountMinor: second.each.amountMinor - first.each.amountMinor,
          currency: input.currency,
        },
      };
    }
  }
  const [first, second] = rankBy(new Set(input.members.map((m) => m.uid)));
  if (first && second && first.each.amountMinor < second.each.amountMinor) {
    return {
      rule: 'crew_mean',
      winnerId: first.id,
      runnerUpId: second.id,
      cheaperByEach: {
        amountMinor: second.each.amountMinor - first.each.amountMinor,
        currency: input.currency,
      },
    };
  }
  return { rule: 'undecided' };
}

export function showdown(input: ShowdownInput): ShowdownResult {
  if (input.options.length < 2) {
    throw new DomainError('VALIDATION', { reason: 'showdown_needs_two_options' });
  }
  const priced = input.options.map((option) => priceOption(input, option));
  const options = input.options.map((option, i) =>
    optionResult(input, option, priced[i] as Priced),
  );
  const votes = input.votes ?? {};
  const top = Math.max(...input.options.map((o) => votes[o.id] ?? 0));
  const leaders = priced.filter((p) => (votes[p.id] ?? 0) === top);
  if (top === 0) return { options, winnerId: null, tieBreak: null };
  if (leaders.length === 1) {
    return { options, winnerId: (leaders[0] as Priced).id, tieBreak: null };
  }
  const tieBreak = breakTie(input, leaders);
  return { options, winnerId: tieBreak.rule === 'undecided' ? null : tieBreak.winnerId, tieBreak };
}
