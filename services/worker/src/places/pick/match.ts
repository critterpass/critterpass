/**
 * Which of our place rows a well-known place named by the model is, when it is one. The model's
 * names are leads from what it knows, so the rules lean towards no match. A row is taken when one
 * of its names is the same words as one of the place's names (accents, case and plurals aside).
 * Short of that, one name must hold the other with at most one word to spare, they must share two
 * words that say more than the destination's own name, and the row must be the same kind of
 * place: "Dinh Bảo Đại" is "Dinh III Bảo Đại", but "Tiệm Cà Phê 1985" is not "Tiệm Cà Phê Số 3",
 * and "Chợ Đà Lạt" is neither a row named just "Đà Lạt" nor the night market. A name no row
 * carries is dropped: a pick must exist in our data.
 */
import type { NamedPlace, PlacePickKind } from '@cp/ai';
import { nameAliases, nameTokens } from '@cp/planner';

export interface PickCandidate {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  /** The open-data quality score search ranks by. */
  readonly quality: number;
}

/** Name scores: the same words, the same telling words, or one name inside the other. */
const SAME_NAME = 1;
const SAME_TELLING = 0.9;
const ONE_WORD_APART = 0.7;

const SIGHTS = ['temple_shrine', 'museum', 'nature', 'beach', 'other'] as const;

/** The row categories each named kind may be stored as (open-data categories are rough). */
const KIND_CATEGORIES: Readonly<Record<PlacePickKind, readonly string[]>> = {
  temple_shrine: SIGHTS,
  museum: SIGHTS,
  nature: SIGHTS,
  beach: SIGHTS,
  other: [...SIGHTS, 'market', 'shopping', 'food', 'nightlife'],
  market: ['market', 'shopping', 'other'],
  shopping: ['shopping', 'market', 'other'],
  food: ['food'],
  cafe: ['food'],
  nightlife: ['nightlife', 'food'],
};

/** The category a named kind is stored as when the row says exactly that. */
const kindCategory = (kind: PlacePickKind): string => (kind === 'cafe' ? 'food' : kind);

interface Alias {
  readonly full: ReadonlySet<string>;
  /** Without the destination's own words ("da", "lat", "vietnam"). */
  readonly telling: ReadonlySet<string>;
}

function aliasesOf(names: readonly (string | null)[], plain: ReadonlySet<string>): Alias[] {
  return names.flatMap((name) =>
    name === null
      ? []
      : nameAliases(name).primary.map((tokens) => ({
          full: new Set(tokens),
          telling: new Set(tokens.filter((token) => !plain.has(token))),
        })),
  );
}

function shared(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const token of a) if (b.has(token)) count += 1;
  return count;
}

/** How alike two names are: 1 for the same words, less for one held in the other, else 0. */
function aliasScore(a: Alias, b: Alias): number {
  if (a.telling.size === 0 || b.telling.size === 0) return 0;
  if (a.full.size === b.full.size && shared(a.full, b.full) === a.full.size) return SAME_NAME;
  const both = shared(a.telling, b.telling);
  const spare = Math.max(a.telling.size, b.telling.size) - both;
  if (both < 2 || both < Math.min(a.telling.size, b.telling.size) || spare > 1) return 0;
  return spare === 0 ? SAME_TELLING : ONE_WORD_APART;
}

/** The destination's own words, which identify no place inside it. */
export function plainWords(destination: string, country: string | null): Set<string> {
  const name = nameTokens(destination);
  // English names often write a two-word city as one ("Dalat", "Hoian").
  return new Set([...name, name.join(''), ...nameTokens(country ?? '')]);
}

/** A candidate row with its name score (1 for the same words, less for one held in the other). */
export interface ScoredCandidate {
  readonly row: PickCandidate;
  readonly score: number;
}

/** The score at which two names are the same words. */
export const SAME_NAME_SCORE = SAME_NAME;

/**
 * Every row among `candidates` that may be the named place, best first: name score, then the row
 * stored as exactly that kind, the same kind of place, inside the named area, the quality score.
 */
export function rankNamedPlace(
  lead: NamedPlace,
  candidates: readonly PickCandidate[],
  plain: ReadonlySet<string>,
): ScoredCandidate[] {
  const wanted = aliasesOf([lead.name, lead.localName], plain);
  const area = lead.area === null ? [] : nameTokens(lead.area).filter((t) => !plain.has(t));
  const scored: { readonly row: PickCandidate; readonly key: readonly number[] }[] = [];
  for (const row of candidates) {
    let score = 0;
    for (const a of wanted) {
      for (const b of aliasesOf([row.name, row.nameLocal], plain)) {
        score = Math.max(score, aliasScore(a, b));
      }
    }
    const sameKind = KIND_CATEGORIES[lead.kind].includes(row.category);
    if (score === 0 || (score < SAME_NAME && !sameKind)) continue;
    const address = new Set(nameTokens(row.address ?? ''));
    const inArea = area.length > 0 && area.every((token) => address.has(token));
    const key = [
      score,
      Number(row.category === kindCategory(lead.kind)),
      Number(sameKind),
      Number(inArea),
      row.quality,
    ];
    scored.push({ row, key });
  }
  return scored
    .sort((a, b) => compare(b.key, a.key) || (a.row.id < b.row.id ? -1 : 1))
    .map(({ row, key }) => ({ row, score: key[0] ?? 0 }));
}

/** The best row for one named place among `candidates`, or null when none is that place. */
export function matchNamedPlace(
  lead: NamedPlace,
  candidates: readonly PickCandidate[],
  plain: ReadonlySet<string>,
): PickCandidate | null {
  return rankNamedPlace(lead, candidates, plain)[0]?.row ?? null;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** The folded words to search rows by for one named place (both names, plain words left out). */
export function searchWords(lead: NamedPlace, plain: ReadonlySet<string>): string[] {
  const raw = [lead.name, lead.localName ?? '']
    .join(' ')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
  // Raw and folded forms: the stored names are not stemmed ("mountains" and "mountain").
  const folded = nameTokens([lead.name, lead.localName ?? ''].join(' '));
  return [...new Set([...raw, ...folded])].filter((word) => !plain.has(word));
}
