/**
 * IP/trademark screen for critter and form names: an exact match against the denylist (brands,
 * mascots, characters) fails; a close fuzzy match fails too. Everything else still needs a person:
 * each batch gets a checklist with trademark-register search links per name, and the batch waits
 * for the owner's sign-off before it can be approved.
 */
import denylist from './denylist.json' with { type: 'json' };

/** Similarity at or above this is too close to a protected name. */
export const IP_FUZZY_THRESHOLD = 0.82;

export function normaliseName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] ?? 0;
      row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export interface IpMatch {
  readonly protectedName: string;
  readonly score: number;
  readonly exact: boolean;
}

export interface IpResult {
  readonly name: string;
  readonly status: 'clear' | 'flagged';
  readonly matches: readonly IpMatch[];
}

const PROTECTED = denylist.names.map((name) => ({ name, norm: normaliseName(name) }));

/** Screens one name: the whole name and each word against every protected name. */
export function checkName(name: string, threshold = IP_FUZZY_THRESHOLD): IpResult {
  const norm = normaliseName(name);
  const candidates = [norm, ...norm.split(' ').filter((word) => word.length >= 4)];
  const matches: IpMatch[] = [];
  for (const entry of PROTECTED) {
    const score = Math.max(...candidates.map((candidate) => similarity(candidate, entry.norm)));
    const exact = candidates.includes(entry.norm) || ` ${norm} `.includes(` ${entry.norm} `);
    if (exact || score >= threshold) {
      matches.push({ protectedName: entry.name, score: Number(score.toFixed(3)), exact });
    }
  }
  return { name, status: matches.length > 0 ? 'flagged' : 'clear', matches };
}

const encode = encodeURIComponent;

/** Markdown checklist for the owner's sign-off: one row per name with register search links. */
export function ipChecklist(batchKey: string, results: readonly IpResult[]): string {
  const lines = [
    `# IP and trademark checklist · ${batchKey}`,
    '',
    'Tick each name after searching the registers. Flagged names must be renamed before approval.',
    '',
    '| | Name | Screen | EUIPO | USPTO | WIPO |',
    '|---|---|---|---|---|---|',
  ];
  for (const result of results) {
    const screen =
      result.status === 'clear'
        ? 'clear'
        : `FLAGGED: ${result.matches.map((m) => `${m.protectedName} (${m.score})`).join(', ')}`;
    const q = encode(result.name);
    lines.push(
      `| [ ] | ${result.name} | ${screen} | [search](https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/${q}) | [search](https://tmsearch.uspto.gov/search/search-results?query=${q}) | [search](https://branddb.wipo.int/en/quicksearch?by=brandName&v=${q}) |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
