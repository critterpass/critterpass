/**
 * Crew awards (3m-5): one per traveller, chosen by code from what each of them actually did on the
 * trip. Every candidate (traveller, award) is scored by how close the traveller came to the crew's
 * best on that award's metric; the strongest candidates are dealt first, each award at most once
 * and each traveller once. Ties break on the raw count, then the award's order, then the user id,
 * so every run over the same numbers deals the same hand. A traveller the numbers say nothing about
 * gets the neutral award.
 */
import {
  AWARD_METRICS,
  FALLBACK_AWARD_KIND,
  type AwardMetric,
  type EvidenceAwardKind,
  type MemberMetrics,
  type RecapAwardDraft,
  type RecapAwardEvidence,
} from './schema';

/** The smallest count that earns each award (one revisit is not a favourite place). */
const MIN_VALUE: Readonly<Record<EvidenceAwardKind, number>> = {
  treasurer: 1,
  planner: 1,
  early_riser: 1,
  critter_whisperer: 1,
  explorer: 1,
  best_find: 2,
  navigator: 1,
  human_camera: 1,
};

const KIND_ORDER = Object.keys(AWARD_METRICS) as EvidenceAwardKind[];

/** Extra numbers an award's line may quote, gathered by the contributors per traveller. */
export interface MemberAwardDetail {
  readonly earliest_time?: string;
  readonly poi_id?: string;
  readonly poi_name?: string;
}

interface Candidate {
  readonly userId: string;
  readonly kind: EvidenceAwardKind;
  readonly value: number;
  /** The crew's best on the same metric (the score is `value / best`). */
  readonly best: number;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  // a.value / a.best against b.value / b.best, in integers.
  const relative = b.value * a.best - a.value * b.best;
  if (relative !== 0) return relative;
  if (a.value !== b.value) return b.value - a.value;
  const kind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  if (kind !== 0) return kind;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

function valueOf(metrics: MemberMetrics | undefined, metric: AwardMetric): number {
  const value = metrics?.[metric] ?? 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Deals one award to each of `members`, in `members` order. `metrics` and `details` are keyed by
 * user id; a traveller missing from them simply has nothing to show.
 */
export function assignAwards(
  members: readonly string[],
  metrics: ReadonlyMap<string, MemberMetrics>,
  details: ReadonlyMap<string, MemberAwardDetail> = new Map(),
): RecapAwardDraft[] {
  const totals = new Map<EvidenceAwardKind, number>();
  const candidates: Candidate[] = [];
  for (const kind of KIND_ORDER) {
    const metric = AWARD_METRICS[kind];
    const values = members.map((userId) => valueOf(metrics.get(userId), metric));
    const best = Math.max(0, ...values);
    totals.set(
      kind,
      values.reduce((sum, value) => sum + value, 0),
    );
    if (best < MIN_VALUE[kind]) continue;
    members.forEach((userId, index) => {
      const value = values[index] ?? 0;
      if (value >= MIN_VALUE[kind]) candidates.push({ userId, kind, value, best });
    });
  }
  candidates.sort(compareCandidates);

  const dealt = new Map<string, Candidate>();
  const usedKinds = new Set<EvidenceAwardKind>();
  for (const candidate of candidates) {
    if (dealt.has(candidate.userId) || usedKinds.has(candidate.kind)) continue;
    dealt.set(candidate.userId, candidate);
    usedKinds.add(candidate.kind);
  }

  return members.map((userId): RecapAwardDraft => {
    const award = dealt.get(userId);
    if (award === undefined) {
      return { user_id: userId, kind: FALLBACK_AWARD_KIND, metric: 'none', value: 0, evidence: {} };
    }
    const total = totals.get(award.kind) ?? award.value;
    const detail = details.get(userId) ?? {};
    const evidence: RecapAwardEvidence = {
      crew_total: total,
      share_pct: total === 0 ? 0 : Math.round((award.value * 100) / total),
      ...(award.kind === 'early_riser' && detail.earliest_time !== undefined
        ? { earliest_time: detail.earliest_time }
        : {}),
      ...(award.kind === 'best_find' && detail.poi_id !== undefined
        ? {
            poi_id: detail.poi_id,
            ...(detail.poi_name === undefined ? {} : { poi_name: detail.poi_name }),
          }
        : {}),
    };
    return {
      user_id: userId,
      kind: award.kind,
      metric: AWARD_METRICS[award.kind],
      value: award.value,
      evidence,
    };
  });
}
