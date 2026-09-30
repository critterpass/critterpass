/**
 * The review panel's rows and result line from the engine's numbers: each line's chip (NOT JORDAN,
 * EVERYONE, BY SHARE or the few who had it), and the crew-currency groups ("Jordan pays $1.50",
 * "Everyone else $13.34"), converted with the device's FX run exactly as the server will.
 */
import { toCrewShares, type FxContext } from '@cp/cost-engine';

import type { MoneyMember } from '../data/context';
import type { ReviewRow } from './LineAssignSheet';
import { receiptShares, shareGroups, type Assignments, type ParsedReceipt } from './review-model';

export interface ReviewCopy {
  readonly everyone: string;
  readonly byShare: string;
  readonly not: (names: string) => string;
  readonly pays: (names: string) => string;
  readonly everyoneElse: string;
  /** A line's amount as the receipt shows it; without it no line is marked to check. */
  readonly amount?: (minor: bigint) => string;
}

/** The lines to check against the paper: only while the lines miss the printed total. */
export function linesToCheck(parsed: ParsedReceipt): ReadonlySet<string> {
  return new Set(parsed.matches_total ? [] : (parsed.review_line_ids ?? []));
}

export function reviewRows(
  parsed: ParsedReceipt,
  assignments: Assignments,
  members: readonly MoneyMember[],
  copy: ReviewCopy,
): ReviewRow[] {
  const toCheck = linesToCheck(parsed);
  return parsed.lines.map((line) => {
    const qty = line.qty !== null && line.qty > 1 ? ` ×${String(line.qty)}` : '';
    const label = `${line.label}${qty}`;
    const check =
      toCheck.has(line.line_id) && copy.amount !== undefined
        ? copy.amount(BigInt(line.amount_minor))
        : null;
    if (line.kind !== 'item') {
      return {
        lineId: line.line_id,
        label,
        check,
        assignees: null,
        chip: { text: copy.byShare, tone: 'plain' },
        byShare: true,
      };
    }
    const ids = assignments[line.line_id] ?? null;
    const had = ids === null ? null : members.filter((member) => ids.includes(member.userId));
    const left = had === null ? [] : members.filter((member) => !ids?.includes(member.userId));
    const chip =
      had === null
        ? { text: copy.everyone, tone: 'plain' as const }
        : left.length <= 2
          ? { text: copy.not(left.map((member) => member.name).join(', ')), tone: 'pink' as const }
          : { text: had.map((member) => member.name).join(', '), tone: 'plain' as const };
    return {
      lineId: line.line_id,
      label,
      check,
      assignees: had ?? members,
      chip,
      byShare: false,
    };
  });
}

export interface ResultPart {
  readonly who: string;
  readonly amountMinor: bigint;
}

/** The result line: the smaller group named, the biggest one as "everyone else". */
export function resultParts(input: {
  readonly parsed: ParsedReceipt;
  readonly assignments: Assignments;
  readonly members: readonly MoneyMember[];
  readonly payerId: string;
  readonly keepTotal: boolean;
  readonly crewCurrency: string;
  readonly fx: FxContext | null;
  readonly copy: ReviewCopy;
}): { readonly parts: readonly ResultPart[]; readonly currency: string } {
  const ids = input.members.map((member) => member.userId);
  const result = receiptShares(
    input.parsed,
    input.assignments,
    ids,
    input.payerId,
    input.keepTotal,
  );
  const total = { amountMinor: result.totalMinor, currency: input.parsed.currency };
  let shares = result.shares;
  let currency = input.parsed.currency;
  if (input.parsed.currency !== input.crewCurrency && input.fx !== null && result.totalMinor > 0n) {
    try {
      shares = toCrewShares(
        total,
        result.shares,
        input.crewCurrency,
        input.fx,
        input.payerId,
      ).shares;
      currency = input.crewCurrency;
    } catch {
      // No rate relating the two on the phone: show the receipt's own currency.
    }
  }
  const groups = shareGroups(shares);
  const name = (id: string) => input.members.find((member) => member.userId === id)?.name ?? '';
  const parts = groups.map((group, index) => ({
    who:
      groups.length > 1 && index === groups.length - 1 && group.userIds.length > 2
        ? input.copy.everyoneElse
        : input.copy.pays(group.userIds.map(name).join(', ')),
    amountMinor: group.amountMinor,
  }));
  return { parts, currency };
}
