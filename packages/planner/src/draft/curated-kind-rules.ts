/**
 * Whether an open-data row is the wrong kind of thing for a curated place, whatever its name.
 * Open data names shops, restaurants and hotels after the street, quay or sight they stand on
 * ("IPPUDO Clarke Quay", "Hotel Sololaki", a Burger King called "Liberdade"), so:
 *
 * - A street, quay, square or district (its researched kind, or else its name, ends in an area
 *   word: `AREA`, read past "walk": an "old-town neighbourhood walk") is never a place to eat, a stay or a
 *   shop, unless the place itself is that kind and the row bears exactly its name, and never any
 *   row whose name is its name plus words of its own ("UP at Robertson Quay", whatever open data
 *   files it under) unless the row is OSM's road or district itself (`mapsArea`).
 * - A stop or a station named after a place is not the place: a researched place is never a
 *   transit row unless the researcher found it to be transit, or its kind says it is a station, a
 *   railway, a pier or a ride ("UNESCO railway terminus", "funicular and viewpoint").
 * - A researched place (one whose kind of place the researcher wrote down) is not a business of
 *   another kind whose name is the place's name plus words of its own ("Trattoria Ponte Vecchio"
 *   is not Ponte Vecchio), unless the researched kind says it is that business ("palace hotel":
 *   "Hotel Emirates Palace" is Emirates Palace). A bar open data files as a restaurant is alike.
 *   A row's words that only say what the place is or where it stands are not words of its own:
 *   its address after a comma or note in brackets ("Đền Thái Vi, xã Ninh Hải"), a second name
 *   after a slash or a dash or in another script ("Дворцовая площадь / Palace Square"), a word of
 *   the researched kind ("Anzac War Memorial", a war memorial), a word for a street ("Jalan Main
 *   Bazaar", "Hall Bazaar Rd.") and a small joining word ("Fish Fry at Arawak Cay").
 * - Among rows that pass, one of a clashing kind goes after one that does not clash, and a part
 *   of the place or a business inside it after the whole place (`wholeness`).
 */
import { nameTokens, namingWords, tellingWords } from './place-names';

/** The kinds of business open data names after where they stand. */
const BUSINESSES: ReadonlySet<string> = new Set(['food', 'stay', 'shopping']);

/** Words that make a place an area to walk, not one door. */
const AREA =
  /^(?:street|road|strip|quay|avenue|lane|district|square|quarter|neighbourhood|neighborhood|precinct|promenade|boulevard)$/u;

/** Words for a street, in English and the local ways of writing one before or after its name. */
const STREET =
  /^(?:street|st|road|rd|avenue|ave|lane|quay|boulevard|blvd|jalan|jl|rue|calle|rua|avenida|thanon|soi|strasse|gasse)$/u;

/** Words of a researched kind that say the place is a station, a stop or a ride. */
const TRANSIT_KIND =
  /\b(?:stations?|terminus|terminal|railways?|train|tram|funicular|cable ?car|ropeway|gondola|ferry|pier|jetty|metro|subway)\b/iu;

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
  /**
   * The row is one of OSM's roads or districts itself: its words of its own name the road or
   * district ("Calle Apolinar Jaén", "Yulin South Road", "Barrio Mágico de Jalatlaco"), never a
   * business standing on it.
   */
  readonly mapsArea?: boolean;
}

/** A kind's last word that says how a place is seen, not what it is ("neighbourhood walk"). */
const SEEN_AS = /^(?:walks?|strolls?|wanders?|visits?)$/u;

/**
 * The last word of each part of a kind ("bar and street-food lane": "bar", "lane"), read past a
 * word for how it is seen ("old-town neighbourhood walk": "neighbourhood").
 */
function kindHeads(subtype: string): string[] {
  return subtype
    .toLowerCase()
    .split(/,|;|&|\(|\)|\band\b|\bwith\b/u)
    .flatMap((part) => {
      const words = part.trim().split(/\s+/u);
      const last = words.at(-1) ?? '';
      return SEEN_AS.test(last) && words.length > 1 ? [words.at(-2) ?? ''] : [last];
    })
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

/** Kind or name words for a place a map draws as a road or a path ("coastal path", "Road to Hana"). */
const WAY =
  /^(?:trail|path|footpath|boardwalk|bridge|ponte|pont|puente|pas|drive|highway|road|step|stair|staircase|escalator|alley|alleyway|courtyard|prospect|prospekt|arcade)$/u;
/** Kind or name words for a place a map draws as a district or a market area ("old town"). */
const SETTLEMENT =
  /^(?:village|town|township|island|isle|medina|settlement|port|hutong|kampung|barrio|commune|ward|subdistrict|area|market|bazaar|souk)$/u;
/** A name's last word that says the place is a thing of its own, whatever its kind says ("Kamo River"). */
const FEATURE =
  /^(?:river|lake|canal|creek|stream|waterfall|beach|bay|cove|lagoon|temple|shrine|pagoda|church|cathedral|basilica|mosque|monastery|museum|palace|castle|tower|zoo|aquarium|bar|pub|cafe|restaurant|izakaya|hotel)$/u;
/** Name words for a square, which maps draw as a pedestrian way or a district. */
const SQUARE = /^(?:place|platz|plaza|piazza|plein|praca|placa|plac|maidan)$/u;

/** Where a place may be one of OSM's roads, paths or districts (`streetScope`). */
export interface StreetScope {
  readonly way: boolean;
  readonly district: boolean;
  /** The place's own name says it is a street, square or area ("Yinyu Lane", "Old Medina"). */
  readonly named: boolean;
}

/**
 * Whether the place may be one of OSM's roads or paths (`way`) or one of its districts
 * (`district`): a street, quay, square or district (`namesAnArea`), a place whose name holds a
 * street or square word ("Queen Street Mall", "Wiener Platz"), or one whose name or kind says it
 * is a road, path, bridge or pass (`WAY`) or a village, town, island, old town or market area
 * (`SETTLEMENT`). A place whose name ends in a thing of its own (`FEATURE`: "Kamo River", a
 * "riverside promenade") or whose kind is a business ("bar in a former geisha house", "local
 * izakaya") is neither, unless its name holds a street or square word.
 */
export function streetScope(lead: KindLead): StreetScope {
  const name = nameTokens(lead.name);
  const words = [...name, ...nameTokens(lead.subtype ?? '')];
  const street = name.some((word) => STREET.test(word) || SQUARE.test(word) || AREA.test(word));
  const named = street || name.some((word) => WAY.test(word) || SETTLEMENT.test(word));
  if (street) return { way: true, district: true, named };
  const parts = lead.name
    .split(/\s+(?:and|&|\/)\s+/iu)
    .map((part) => nameTokens(part).at(-1) ?? '');
  if (parts.every((word) => FEATURE.test(word))) return { way: false, district: false, named };
  if (namesAnArea(lead)) return { way: true, district: true, named };
  const heads = kindHeads(lead.subtype ?? '');
  if (heads.some((word) => Object.values(KIND_WORDS).some((re) => re.test(word)))) {
    return { way: false, district: false, named: false };
  }
  return {
    way: words.some((word) => WAY.test(word)),
    district: words.some((word) => SETTLEMENT.test(word)),
    named,
  };
}

function telling(name: string | null, plain: ReadonlySet<string>): Set<string> {
  if (name === null) return new Set();
  return new Set(tellingWords(namingWords(nameTokens(name)), plain));
}

/**
 * A name without what follows its first part (an address after a comma, a second name after a
 * slash, a bar or a dash: "Concubine Lane - Lorong Panglima") or its note in brackets, or null when
 * the same.
 */
function bareName(name: string | null): string | null {
  if (name === null) return null;
  const bare =
    name
      .replace(/\s*\([^)]*\)/gu, '')
      .split(/\s*(?:,|;|\||\/|\s[-–—]\s)\s*/u)[0]
      ?.trim() ?? '';
  return bare === '' || bare === name.trim() ? null : bare;
}

const LATIN_WORD = /^[\p{Script=Latin}\p{N}]+$/u;

/**
 * A name written twice, in Latin letters and another script ("福隆新街 Rua da Felicidade"), read
 * as each: only when the Latin part is a name of two words or more ("W 表参道" is a bar).
 */
function scriptReadings(name: string | null): string[][] {
  if (name === null) return [];
  const tokens = nameTokens(name);
  const latin = tokens.filter((token) => LATIN_WORD.test(token));
  const other = tokens.filter((token) => !LATIN_WORD.test(token));
  return latin.length >= 2 && other.length > 0 ? [latin, other] : [];
}

/** Small words that join a business's name to where it stands ("Fish Fry at Arawak Cay"). */
const JOINING = /^(?:at|on|by|in)$/u;

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
  const theirs = [
    ...names.map((name) => telling(name, plain)),
    ...[row.name, row.nameLocal]
      .flatMap(scriptReadings)
      .map((tokens) => new Set(tellingWords(namingWords(tokens), plain))),
  ].filter((s) => s.size);
  const kindWords = new Set(nameTokens(lead.subtype ?? ''));
  const notOwn = (w: string) => kindWords.has(w) || STREET.test(w) || JOINING.test(w);
  let extra = false;
  for (const a of ours) {
    for (const b of theirs) {
      if (![...a].every((word) => b.has(word))) continue;
      const own = [...b].filter((w) => a.has(w) || !notOwn(w));
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

/** Words (as `nameTokens` writes them) for a part of a place or a business inside it. */
const PART_WORDS =
  /^\d*(?:room|gallery|gallerie|gate|entrance|entry|exit|wing|hall|floor|level|platform|ticket|office|post|toilet|parking|carpark|shop|store|cafe|kiosk)$/u;

/**
 * How far a row's name is from naming the whole place, for ordering rows of one name: 0 when it
 * holds no words the place's names lack ("The British Museum"), 1 when it does, 2 when one of them
 * is a part of the place or a business inside it ("British Museum - Room 23", "Bodleian Library
 * Ticket office", "Taipei 101 - 91Floor Toilet").
 */
export function wholeness(
  name: string,
  plain: ReadonlySet<string>,
  leadWords: ReadonlySet<string>,
): number {
  const own = tellingWords(namingWords(nameTokens(name)), plain).filter(
    (word) => !leadWords.has(word),
  );
  if (own.some((word) => PART_WORDS.test(word))) return 2;
  return own.length > 0 ? 1 : 0;
}

/** Whether a transit row stands in for a researched place that is no stop (see the file header). */
export function transitStandIn(lead: KindLead, row: KindRow): boolean {
  if (lead.subtype === undefined || row.category !== 'transit' || lead.category === 'transit') {
    return false;
  }
  return !TRANSIT_KIND.test(lead.subtype ?? '');
}

/** Whether the row is the wrong kind of thing to be the place (see the file header). */
export function wrongKind(lead: KindLead, row: KindRow, plain: ReadonlySet<string>): boolean {
  if (transitStandIn(lead, row)) return true;
  if (namesAnArea(lead)) {
    if (row.mapsArea !== true && nameWithExtraWords(lead, row, plain)) return true;
    if (BUSINESSES.has(row.category)) return row.category !== lead.category;
  }
  return kindClash(lead, row) && nameWithExtraWords(lead, row, plain);
}
