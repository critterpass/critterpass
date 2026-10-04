/**
 * Which Wikidata item a curated place is, when it is one: no POI carries a Wikidata id, so an item
 * nearby with a close name stands in for it. A wrong match would show another place's photo as
 * this one, so the rules lean towards no match: the item lies within 1.5 km (3 km for beaches and
 * nature), one of the place's names (the parts around brackets, dashes and commas) and one of the
 * item's labels share most of the words that set the name apart (not a place type, not the city),
 * every place type in the place's name (pagoda, museum, beach) is in the item's labels too, and a
 * type all of the item's labels carry is in the place's name.
 * An item that is a venue named after something (a museum, a market, a station) only matches a
 * place named as that venue, and a temple never matches the beach or hill it is named after.
 * Between equally good items the closer name wins, then the nearer item.
 * Food, nightlife, health and stays match only on an identical whole name. Administrative areas
 * are left out of the items (see places.ts).
 */

import { FEATURES, PLAIN, TYPE_ENDINGS, TYPES, VENUES, WORSHIP } from './place-words';

export interface PlaceForMatch {
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

/** A Wikidata item with a point and its English and local labels. */
export interface WikidataPoint {
  /** `Q123` */
  readonly id: string;
  readonly labels: readonly string[];
  readonly lat: number;
  readonly lng: number;
}

export interface WikidataPlace extends WikidataPoint {
  /** The item's image (P18) as a Commons `File:` title. */
  readonly file: string;
}

export interface PlaceMatch<T extends WikidataPoint = WikidataPlace> {
  readonly item: T;
  readonly label: string;
  readonly score: number;
  readonly distanceM: number;
}

const MAX_DISTANCE_M = 1500;
/** A beach or a mountain runs for kilometres; its Wikidata point can sit far from the POI's. */
const WIDE_DISTANCE_M = 3000;
const WIDE = new Set(['beach', 'nature']);
const MIN_SCORE = 0.65;
const EXACT_ONLY = new Set(['food', 'nightlife', 'health', 'stay']);

/** Whole-word overlap of two names, which settles equal scores (a museum over a gallery). */
function closeness(variant: string, label: string): number {
  const a = new Set(words(variant));
  const b = new Set(words(label));
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared || 1);
}

const TYPE_WORDS = new Set(Object.values(TYPES).flatMap((phrases) => phrases.flatMap(words)));

export function words(text: string): string[] {
  return text
    .replace(/[đĐ]/gu, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\bdalat\b/gu, 'da lat')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** The words of `text` that set a place apart: not a place type, not the region, not filler. */
export function tellingWords(text: string): string[] {
  return words(text).filter((word) => !PLAIN.has(word) && !TYPE_WORDS.has(word));
}

function typesOf(tokens: readonly string[]): Set<string> {
  const joined = ` ${tokens.join(' ')} `;
  const found = new Set<string>();
  for (const [type, phrases] of Object.entries(TYPES)) {
    if (phrases.some((phrase) => joined.includes(` ${phrase} `))) found.add(type);
  }
  for (const token of tokens) {
    for (const [ending, type] of TYPE_ENDINGS) {
      if (token.length > ending.length && token.endsWith(ending)) found.add(type);
    }
  }
  return found;
}

/**
 * The names a place goes by: the whole name and its parts around brackets, dashes and slashes
 * (a second language, or a second name). After a comma comes where it is ("Penha Palace, Sintra,
 * Portugal"), which is no name of the place: only what stands before the first comma counts.
 */
export function nameVariants(name: string): string[] {
  const head = name.split(',')[0] ?? name;
  const parts = head.split(/[()[\]/|]|\s[-–—]\s|-(?=\s)|(?<=\S)-(?=\p{Lu})/u);
  return [...new Set([name, head, ...parts].map((part) => part.trim()).filter(Boolean))];
}

export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * How well `variant`, one of the names of the place called `name`, fits `label`, one of the item's
 * `labels`: 0 when it must not match.
 */
export function nameScore(
  name: string,
  variant: string,
  label: string,
  exactOnly: boolean,
  labels: readonly string[] = [label],
): number {
  if (exactOnly && variant !== name) return 0;
  const a = new Set(words(variant));
  const b = new Set(words(label));
  if (a.size === 0 || b.size === 0) return 0;
  const shared = [...a].filter((word) => b.has(word));
  const identical = shared.length === a.size && shared.length === b.size;
  const placeTypes = typesOf(words(name));
  const labelTypes = typesOf(labels.flatMap((text) => [...words(text), '|']));
  if (![...placeTypes].every((type) => labelTypes.has(type))) return 0;
  // An item every label calls a church is not a ward that shares its name.
  const always = labels.map((text) => typesOf(words(text)));
  const needed = [...(always[0] ?? [])].filter((type) => always.every((types) => types.has(type)));
  if (!needed.every((type) => placeTypes.has(type))) return 0;
  // A museum, market or station named after the place is not the place.
  if ([...typesOf([...b])].some((type) => VENUES.has(type) && !placeTypes.has(type))) return 0;
  if (identical) return [...a].some((word) => !PLAIN.has(word)) ? 1 : 0;
  if (exactOnly) return 0;
  const telling = (word: string) => !PLAIN.has(word) && !TYPE_WORDS.has(word);
  // Most of what sets the place's name apart has to be in the label too.
  const sharedTelling = shared.filter(telling).length;
  if (sharedTelling * 2 <= [...a].filter(telling).length) return 0;
  return sharedTelling / [...new Set([...a, ...b])].filter(telling).length;
}

/**
 * The item this place most likely is, or null. `wholeName` only matches on the name or on a part
 * of it that keeps every word setting the name apart ("Chùa Cầu" of "Chùa Cầu - Hội An", not
 * "Bà Nà" of "Thích Ca Phật Đài - Bà Nà").
 */
export function matchPlace<T extends WikidataPoint>(
  place: PlaceForMatch,
  items: readonly T[],
  wholeName = false,
): PlaceMatch<T> | null {
  const exactOnly = EXACT_ONLY.has(place.category);
  const telling = tellingWords(place.name);
  const variants = nameVariants(place.name).filter(
    (variant) => !wholeName || telling.every((word) => tellingWords(variant).includes(word)),
  );
  const placeTypes = typesOf(words(place.name));
  let best: PlaceMatch<T> | null = null;
  let bestClose = 0;
  for (const item of items) {
    const distance = Math.round(distanceM(place, item));
    if (distance > (WIDE.has(place.category) ? WIDE_DISTANCE_M : MAX_DISTANCE_M)) continue;
    // A temple named after the beach or the hill it stands by is not that beach or hill.
    if (place.category === 'temple_shrine') {
      const itemTypes = typesOf(item.labels.flatMap((text) => [...words(text), '|']));
      const worship = [...WORSHIP].some((type) => itemTypes.has(type));
      const feature = [...FEATURES].some((type) => itemTypes.has(type) && !placeTypes.has(type));
      if (feature && !worship) continue;
    }
    for (const variant of variants) {
      for (const label of item.labels) {
        const score = nameScore(place.name, variant, label, exactOnly, item.labels);
        if (score < MIN_SCORE) continue;
        const close = closeness(variant, label);
        if (
          best === null ||
          score > best.score ||
          (score === best.score && close > bestClose) ||
          (score === best.score && close === bestClose && distance < best.distanceM)
        ) {
          best = { item, label, score, distanceM: distance };
          bestClose = close;
        }
      }
    }
  }
  return best;
}
