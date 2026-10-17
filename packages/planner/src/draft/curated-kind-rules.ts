/**
 * Whether an open-data row is the wrong kind of thing for a curated place, whatever its name.
 * Open data names shops, restaurants and hotels after the street, quay or sight they stand on
 * ("IPPUDO Clarke Quay", "Hotel Sololaki", a Burger King called "Liberdade"), so:
 *
 * - A street, quay, square or district (its researched kind, or else its name, ends in an area
 *   word: `AREA`) is never a place to eat, a stay or a shop, unless the place itself is that kind
 *   and the row bears exactly its name.
 * - A researched place (one whose kind of place the researcher wrote down) is not a business of
 *   another kind whose name is the place's name plus words of its own ("Trattoria Ponte Vecchio"
 *   is not Ponte Vecchio), unless the researched kind says it is that business ("palace hotel":
 *   "Hotel Emirates Palace" is Emirates Palace). A bar open data files as a restaurant is alike.
 *   A row's words that only say what the place is or where it stands are not words of its own:
 *   its address after a comma or note in brackets ("Đền Thái Vi, xã Ninh Hải"), a word of the
 *   researched kind ("Anzac War Memorial", a war memorial) and a word for a street ("Jalan Main
 *   Bazaar").
 * - Among rows that pass, one of a clashing kind goes after one that does not clash.
 */
import { nameTokens, namingWords, tellingWords } from './place-names';

/** The kinds of business open data names after where they stand. */
const BUSINESSES: ReadonlySet<string> = new Set(['food', 'stay', 'shopping']);

/** Words that make a place an area to walk, not one door. */
const AREA =
  /^(?:street|road|strip|quay|avenue|lane|district|square|quarter|neighbourhood|neighborhood|precinct|promenade|boulevard)$/u;

/** Words for a street, in English and the local ways of writing one before or after its name. */
const STREET =
  /^(?:street|road|avenue|lane|quay|boulevard|jalan|jl|rue|calle|rua|avenida|thanon|soi|strasse|gasse)$/u;

/** The researched kind's words that say a place is that business. */
const KIND_WORDS: Readonly<Record<string, RegExp>> = {
  food: /\b(?:restaurants?|caf[eé]s?|bars?|bistros?|brasserie|eatery|tea ?rooms?|pubs?|food)\b/iu,
  stay: /\b(?:hotels?|resorts?|lodges?|hostels?|inns?|guesthouses?)\b/iu,
  shopping: /\b(?:malls?|shops?|stores?|shopping|arcades?|souks?)\b/iu,
};

/** Kinds open data and the researchers file the same place under: a bar as a restaurant. */
const ALIKE: ReadonlySet<string> = new Set(['food:nightlife', 'nightlife:food']);

/** What the kind rules read of a curated place. */
export interface KindLead {
  readonly name: string;
  readonly localName: string | null;
  readonly category: string;
  /** The researcher's kind of place ("riverside bar strip"); absent when nobody researched it. */
  readonly subtype?: string | null;
}

/** What the kind rules read of a row. */
export interface KindRow {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
}

/** The last word of each part of a kind ("bar and street-food lane": "bar", "lane"). */
function kindHeads(subtype: string): string[] {
  return subtype
    .toLowerCase()
    .split(/,|;|&|\(|\)|\band\b|\bwith\b/u)
    .flatMap((part) => part.trim().split(/\s+/u).slice(-1))
    .filter((word) => word !== '');
}

/**
 * Whether the place is a street, quay, square or district (see the file header). Its name's last
 * word counts unless its researched kind is a business ("Bangkok Street", a Thai restaurant).
 */
export function namesAnArea(lead: KindLead): boolean {
  const heads = kindHeads(lead.subtype ?? '');
  const business = heads.some((word) => Object.values(KIND_WORDS).some((re) => re.test(word)));
  const last = business ? [] : [nameTokens(lead.name).at(-1) ?? ''];
  return [...last, ...heads].some((word) => AREA.test(word));
}

function telling(name: string | null, plain: ReadonlySet<string>): Set<string> {
  if (name === null) return new Set();
  return new Set(tellingWords(namingWords(nameTokens(name)), plain));
}

/** A name without its address after a comma or its note in brackets, or null when the same. */
function bareName(name: string | null): string | null {
  if (name === null) return null;
  const bare =
    name
      .replace(/\s*\([^)]*\)/gu, '')
      .split(',')[0]
      ?.trim() ?? '';
  return bare === '' || bare === name.trim() ? null : bare;
}

/**
 * Whether the row's name is the place's name plus words of its own: one of its names holds every
 * telling word of one of the place's names and more, and none is the place's name word for word.
 * Words of the researched kind, words for a street and a name's address or note are not its own.
 */
export function nameWithExtraWords(
  lead: KindLead,
  row: KindRow,
  plain: ReadonlySet<string>,
): boolean {
  const ours = [telling(lead.name, plain), telling(lead.localName, plain)].filter((s) => s.size);
  const names = [row.name, row.nameLocal, bareName(row.name), bareName(row.nameLocal)];
  const theirs = names.map((name) => telling(name, plain)).filter((s) => s.size);
  const kindWords = new Set(nameTokens(lead.subtype ?? ''));
  let extra = false;
  for (const a of ours) {
    for (const b of theirs) {
      if (![...a].every((word) => b.has(word))) continue;
      const own = [...b].filter((w) => a.has(w) || !(kindWords.has(w) || STREET.test(w)));
      if (own.length === a.size) return false;
      extra = true;
    }
  }
  return extra;
}

/**
 * Whether the row is a business of another kind than the researched place (see the file header);
 * never for a place nobody researched.
 */
export function kindClash(lead: KindLead, row: KindRow): boolean {
  if (lead.subtype === undefined || !BUSINESSES.has(row.category)) return false;
  if (row.category === lead.category || ALIKE.has(`${lead.category}:${row.category}`)) {
    return false;
  }
  return !(KIND_WORDS[row.category]?.test(lead.subtype ?? '') ?? false);
}

/** Whether the row is the wrong kind of thing to be the place (see the file header). */
export function wrongKind(lead: KindLead, row: KindRow, plain: ReadonlySet<string>): boolean {
  if (BUSINESSES.has(row.category) && namesAnArea(lead)) {
    return row.category !== lead.category || nameWithExtraWords(lead, row, plain);
  }
  return kindClash(lead, row) && nameWithExtraWords(lead, row, plain);
}
