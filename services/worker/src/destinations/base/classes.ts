/**
 * Which Wikivoyage-linked Wikidata items are destinations, from their classes (P31).
 *
 * Every candidate already has an English or Vietnamese Wikivoyage article, so the classes only
 * sort out what kind of article it is. Wikidata's class tree is uneven: Valencia is only a
 * "municipality of Spain", Zurich a "municipality of Switzerland" and a "largest city", Hallstatt a
 * "market municipality", Hakone a "town of Japan". A short list of direct classes would miss them,
 * so each class is tested against broad root classes through `wdt:P279*` (one closure query per
 * build over the few thousand classes the candidates use), plus a few direct classes the tree does
 * not place under a root (a Vietnamese huyện or commune, a Chinese county, a Thai amphoe).
 *
 * An item is a destination when one of its classes, not itself a city part or a country-level
 * unit, reaches a settlement, island or sight root. Classes under a neighbourhood, suburb, quarter,
 * city or urban district, country or first-level region count only when also under city: Hoàn
 * Kiếm, Eixample and Goa (a state) are out, while Monaco and Singapore stay through their
 * city-state class and Seoul and Incheon through their city classes. An item with a country class
 * is a destination only as a city, one with a first-level class only as a city or an island (Kiên
 * Giang province, also filed as a "human settlement", is out), an island of two million people or
 * more is a region, and an airport is never a destination. A Wikivoyage district subpage
 * (`Hanoi/Old Quarter`, not a city named with a slash such as `Biel/Bienne`) is a part of its city
 * whatever its classes. A park or ancient city is a park even when also filed as a settlement.
 */
import type { DestinationKind } from '@cp/domain';

/** Root classes a candidate's class is tested against, with what reaching each one means. */
export const SETTLEMENT_ROOTS = [
  'Q486972', // human settlement
  'Q515', // city
  'Q3957', // town
  'Q532', // village
  'Q15284', // municipality
  'Q70208', // municipality of Switzerland (not under municipality)
  'Q1021711', // seaside resort
  'Q130003', // ski resort
] as const;
export const ISLAND_ROOTS = [
  'Q23442', // island
  'Q33837', // archipelago
  'Q1402592', // island group
] as const;
export const SIGHT_ROOTS = [
  'Q46169', // national park
  'Q473972', // protected area
  'Q839954', // archaeological site
  'Q1200957', // tourist destination
  'Q23397', // lake
  'Q39594', // bay
  'Q40080', // beach
  'Q177380', // hot spring (Pamukkale)
] as const;
/**
 * City parts and country-level units: a class under one of these makes no destination unless it is
 * also under city (Seoul's "special city", Hanoi's "city in Vietnam", Incheon's "metropolitan city"
 * are first-level units and cities at once).
 */
export const PART_ROOTS = [
  'Q123705', // neighbourhood
  'Q188509', // suburb
  'Q2983893', // quarter
  'Q4286337', // city district
  'Q6644510', // urban district
  'Q738570', // central business district
  'Q702842', // municipal arrondissement
  'Q17051044', // mahalle
  'Q6256', // country
  'Q10864048', // first-level administrative division
  'Q1248784', // airport
] as const;

/** Direct classes that count without a root: places Wikivoyage covers as towns or sights. */
export const DIRECT_CLASSES: Readonly<Record<string, 'town' | 'park'>> = {
  Q2582669: 'town', // district (a Vietnamese huyện: Bắc Hà, Mộc Châu)
  Q2389082: 'town', // commune of Vietnam (Tam Đảo)
  Q687188: 'town', // ward of Vietnam (Mũi Né, Cửa Lò)
  Q1070942: 'town', // commune-level town of Vietnam (Lăng Cô)
  Q1289426: 'town', // county of China (Yangshuo)
  Q1336099: 'town', // autonomous county of China
  Q1070990: 'town', // county-level city of China (Dali, Dunhuang)
  Q475061: 'town', // amphoe (Pai, Ko Lanta)
  Q2393184: 'town', // hill station
  Q875157: 'town', // resort
  Q6838244: 'park', // AAAAA-rated tourist attraction
  Q34038: 'park', // waterfall
  Q35509: 'park', // cave
};

export const ALL_ROOTS: readonly string[] = [
  ...SETTLEMENT_ROOTS,
  ...ISLAND_ROOTS,
  ...SIGHT_ROOTS,
  ...PART_ROOTS,
];

/** Each class with the roots it reaches through `wdt:P279*` (itself included). */
export function classRootsQuery(classes: readonly string[]): string {
  return `SELECT ?c ?root WHERE {
  VALUES ?c { ${classes.map((qid) => `wd:${qid}`).join(' ')} }
  VALUES ?root { ${ALL_ROOTS.map((qid) => `wd:${qid}`).join(' ')} }
  ?c wdt:P279* ?root .
}`;
}

export interface ClassedItem {
  /** Direct classes (P31). */
  readonly classes: readonly string[];
  /** Its Wikivoyage article titles. */
  readonly titles: readonly string[];
  /** Its English and Vietnamese labels. */
  readonly labels: readonly string[];
  readonly population: number | null;
}

export const MAX_ISLAND_POPULATION = 2_000_000;

const PARK_FIRST = ['Q46169', 'Q473972', 'Q839954'];

const has = (roots: ReadonlySet<string>, list: readonly string[]) =>
  list.some((root) => roots.has(root));

/**
 * The kind of destination an item is, or null when it is none (a city part, a country or region,
 * an airport, a language, a mountain range, an unlisted class).
 */
export function destinationKind(
  item: ClassedItem,
  rootsOf: ReadonlyMap<string, ReadonlySet<string>>,
): DestinationKind | null {
  const subpage = (title: string) => title.includes('/') && !item.labels.includes(title);
  if (item.titles.some(subpage)) return null;
  const counted = item.classes.filter((cls) => {
    const reached = rootsOf.get(cls) ?? new Set<string>();
    return reached.has('Q515') || !has(reached, PART_ROOTS);
  });
  const roots = new Set(counted.flatMap((cls) => [...(rootsOf.get(cls) ?? [])]));
  const reachedAny = (list: readonly string[]) =>
    item.classes.some((cls) => has(rootsOf.get(cls) ?? new Set(), list));
  // An airport is never a destination; a country is one only as a city (Monaco, Singapore), a
  // province only as a city or an island (Seoul, Jeju), never through a loose "human settlement"
  // class (Kiên Giang province).
  if (reachedAny(['Q1248784'])) return null;
  if (reachedAny(['Q6256']) && !roots.has('Q515')) return null;
  if (reachedAny(['Q10864048']) && !roots.has('Q515') && !has(roots, ISLAND_ROOTS)) return null;
  const direct = counted.flatMap((cls) => {
    const kind = DIRECT_CLASSES[cls];
    return kind === undefined ? [] : [kind];
  });
  const big = (item.population ?? 0) >= 100_000;
  // A park or an ancient city (Yosemite, Machu Picchu, Bagan) is a site to visit, even when
  // Wikidata also files it as a settlement.
  if (has(roots, PARK_FIRST)) return 'park';
  if (has(roots, ISLAND_ROOTS) && !big) return 'island';
  if (has(roots, SETTLEMENT_ROOTS) || direct.includes('town')) {
    if (big || roots.has('Q515')) return 'city';
    if (roots.has('Q532') && !roots.has('Q3957')) return 'village';
    return 'town';
  }
  // An island of millions (Honshu, Java, the British Isles) is a region, not a destination.
  if (has(roots, ISLAND_ROOTS))
    return (item.population ?? 0) < MAX_ISLAND_POPULATION ? 'island' : null;
  if (has(roots, SIGHT_ROOTS) || direct.includes('park')) return 'park';
  return null;
}
