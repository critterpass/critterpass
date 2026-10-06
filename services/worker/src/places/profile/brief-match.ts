/**
 * Which of our rows each name a brief gives is. A name whose best row carries the same words, with
 * no other row as close, is that row. A close call (one name held in the other, or two rows
 * equally close: often one place under two sources) goes to Jev (`poi.duplicate_tiebreak`), which
 * keeps the candidate it is sure of. A name no row carries, or one Jev is unsure about, is
 * dropped: an essential must exist in our data. A row is used once.
 */
import { noul, type BriefLead, type DecisionClient } from '@cp/ai';
import { withSystem } from '@cp/db';
import { decisionBand, yesNoVerdict } from '@cp/domain';
import type pg from 'pg';

import { namedCandidates } from '../pick/candidates';
import {
  plainWords,
  rankNamedPlace,
  SAME_NAME_SCORE,
  type PickCandidate,
  type ScoredCandidate,
} from '../pick/match';

export const TIEBREAK_ROUTE = 'poi.duplicate_tiebreak' as const;
/** Candidates a close call puts to Jev, and pairs per call. */
export const CLOSE_CANDIDATES = 3;
const PAIRS_PER_CALL = 20;

export type MatchVerdict =
  | { readonly kind: 'match'; readonly row: PickCandidate }
  | { readonly kind: 'close'; readonly rows: readonly PickCandidate[] }
  | { readonly kind: 'none' };

/** The verdict on one name from its ranked candidates (rows already used left out). */
export function classifyMatch(ranked: readonly ScoredCandidate[]): MatchVerdict {
  const [first, second] = ranked;
  if (first === undefined) return { kind: 'none' };
  if (first.score >= SAME_NAME_SCORE && (second === undefined || second.score < first.score)) {
    return { kind: 'match', row: first.row };
  }
  return { kind: 'close', rows: ranked.slice(0, CLOSE_CANDIDATES).map((c) => c.row) };
}

export interface MatchedLead<L extends BriefLead> {
  readonly lead: L;
  readonly row: PickCandidate;
}

export interface LeadMatches<L extends BriefLead> {
  readonly matched: readonly MatchedLead<L>[];
  readonly dropped: readonly { readonly name: string; readonly reason: string }[];
  readonly costMicros: number;
}

interface Pair {
  readonly lead: number;
  readonly row: PickCandidate;
}

async function tiebreak<L extends BriefLead>(
  decisions: Pick<DecisionClient, 'decide'>,
  leads: readonly L[],
  pairs: readonly Pair[],
  usage: { jobId?: string },
): Promise<{ p: Map<Pair, number>; costMicros: number }> {
  const p = new Map<Pair, number>();
  let costMicros = 0;
  for (let start = 0; start < pairs.length; start += PAIRS_PER_CALL) {
    const chunk = pairs.slice(start, start + PAIRS_PER_CALL);
    const questions = Object.fromEntries(
      chunk.map((_, i) => [
        `pair_${i}`,
        noul(`Is pair_${i}'s record the place pair_${i}'s guide names?`, {
          true: 'the same venue, landmark or business, perhaps named in another language',
          false: 'a different place, or a shop or street named after it',
        }),
      ]),
    );
    const state = Object.fromEntries(
      chunk.map((pair, i) => {
        const lead = leads[pair.lead];
        return [
          `pair_${i}`,
          {
            guide: { name: lead?.name, local_name: lead?.localName, kind: lead?.kind },
            record: {
              name: pair.row.name,
              local_name: pair.row.nameLocal,
              category: pair.row.category,
              address: pair.row.address,
            },
          },
        ];
      }),
    );
    const decision = await decisions.decide(TIEBREAK_ROUTE, { state, questions }, usage);
    costMicros += decision.costMicros;
    const band = decisionBand(TIEBREAK_ROUTE, decision.answered_by);
    chunk.forEach((pair, i) => {
      const answer = decision.answers[`pair_${i}`];
      const yes = answer?.type === 'noul' ? answer.noul : 0.5;
      if (yesNoVerdict(yes, band) === 'yes') p.set(pair, yes);
    });
  }
  return { p, costMicros };
}

export async function matchBriefLeads<L extends BriefLead>(
  pool: pg.Pool,
  destination: { readonly id: string; readonly name: string; readonly country: string | null },
  leads: readonly L[],
  decisions: Pick<DecisionClient, 'decide'>,
  usage: { jobId?: string } = {},
): Promise<LeadMatches<L>> {
  const plain = plainWords(destination.name, destination.country);
  const candidates = await withSystem(pool, async (tx) => {
    const out: PickCandidate[][] = [];
    for (const lead of leads) out.push(await namedCandidates(tx, destination.id, lead, plain));
    return out;
  });
  const used = new Set<string>();
  const verdicts = leads.map((lead, i) => {
    const verdict = classifyMatch(rankNamedPlace(lead, candidates[i] ?? [], plain));
    if (verdict.kind === 'match') used.add(verdict.row.id);
    return verdict;
  });
  const pairs: Pair[] = verdicts.flatMap((verdict, lead) =>
    verdict.kind === 'close'
      ? verdict.rows.filter((row) => !used.has(row.id)).map((row) => ({ lead, row }))
      : [],
  );
  const decided =
    pairs.length === 0
      ? { p: new Map<Pair, number>(), costMicros: 0 }
      : await tiebreak(decisions, leads, pairs, usage).catch(() => ({
          p: new Map<Pair, number>(),
          costMicros: 0,
        }));
  const matched: MatchedLead<L>[] = [];
  const dropped: { name: string; reason: string }[] = [];
  verdicts.forEach((verdict, i) => {
    const lead = leads[i];
    if (lead === undefined) return;
    if (verdict.kind === 'match') {
      matched.push({ lead, row: verdict.row });
      return;
    }
    if (verdict.kind === 'none') {
      dropped.push({ name: lead.name, reason: 'no_row' });
      return;
    }
    const best = pairs
      .filter((pair) => pair.lead === i && decided.p.has(pair) && !used.has(pair.row.id))
      .sort((a, b) => (decided.p.get(b) ?? 0) - (decided.p.get(a) ?? 0))[0];
    if (best === undefined) {
      dropped.push({ name: lead.name, reason: 'unsure_match' });
      return;
    }
    used.add(best.row.id);
    matched.push({ lead, row: best.row });
  });
  // Rows matched outright come first in the brief's own order; a close call keeps its place too.
  const order = new Map(leads.map((lead, i) => [lead, i]));
  matched.sort((a, b) => (order.get(a.lead) ?? 0) - (order.get(b.lead) ?? 0));
  return { matched, dropped, costMicros: decided.costMicros };
}
