/**
 * Ranking and capping the joined candidates: score = ln(sitelinks + 1) + 0.5·ln(population + 1),
 * plus 1 for an island or a national park. Each country keeps at most `perCountry` rows (Vietnam
 * `vietnamMax`); then, when the set is still over `total`, the lowest scores go, except that a
 * country with a critter keeps its best `floor`.
 */
import type { BaseCandidate } from './base-set';

export interface CapRules {
  readonly perCountry: number;
  readonly vietnamMax: number;
  readonly floor: number;
  readonly total: number;
  /** ISO-2 codes of the countries with at least one critter. */
  readonly critterCountries: ReadonlySet<string>;
}

export const BASE_CAP_RULES: Omit<CapRules, 'critterCountries'> = {
  perCountry: 150,
  vietnamMax: 300,
  floor: 10,
  total: 5000,
};

export function baseScore(candidate: BaseCandidate): number {
  const bonus = candidate.kind === 'island' || candidate.kind === 'park' ? 1 : 0;
  return (
    Math.log(candidate.sitelinks + 1) + 0.5 * Math.log((candidate.population ?? 0) + 1) + bonus
  );
}

export interface RankedDestination extends BaseCandidate {
  readonly score: number;
}

export function rankAndCap(
  candidates: readonly BaseCandidate[],
  rules: CapRules,
): RankedDestination[] {
  const byCountry = new Map<string, RankedDestination[]>();
  for (const candidate of candidates) {
    const list = byCountry.get(candidate.countryCode) ?? [];
    list.push({ ...candidate, score: baseScore(candidate) });
    byCountry.set(candidate.countryCode, list);
  }
  const protectedRows = new Set<RankedDestination>();
  const capped: RankedDestination[] = [];
  for (const [country, list] of byCountry) {
    list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const kept = list.slice(0, country === 'VN' ? rules.vietnamMax : rules.perCountry);
    if (rules.critterCountries.has(country)) {
      for (const row of kept.slice(0, rules.floor)) protectedRows.add(row);
    }
    capped.push(...kept);
  }
  capped.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  if (capped.length <= rules.total) return capped;
  const room = Math.max(0, rules.total - protectedRows.size);
  const rest = capped.filter((row) => !protectedRows.has(row)).slice(0, room);
  const keep = new Set([...protectedRows, ...rest]);
  return capped.filter((row) => keep.has(row));
}
