/**
 * Offline airport search for home base (3a-5): exact IATA first, then city prefix, then name word
 * prefix, then name trigram similarity; larger airports win ties. Metro groups ride along when
 * their city matches. Pure and synchronous: it runs per keystroke against the bundled dataset.
 */
import type { Airport, AirportDataset, MetroGroup } from './types';

export type AirportHit =
  | { readonly kind: 'airport'; readonly airport: Airport; readonly score: number }
  | { readonly kind: 'metro'; readonly metro: MetroGroup; readonly score: number };

/** Lowercase, diacritics stripped (Hà Nội → ha noi, São Paulo → sao paulo), đ → d. */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .trim();
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

function similarity(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / (a.size + b.size - shared);
}

const words = (text: string): string[] => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const TRIGRAM_FLOOR = 0.3;

function scoreAirport(airport: Airport, q: string, qGrams: Set<string>): number {
  const rankBonus = (4 - airport.rank) * 10;
  if (q.length === 3 && airport.iata.toLowerCase() === q) return 1000 + rankBonus;
  const city = foldForSearch(airport.city);
  if (city.startsWith(q)) return 600 + rankBonus;
  const name = foldForSearch(airport.name);
  if (words(city).some((w) => w.startsWith(q))) return 500 + rankBonus;
  if (words(name).some((w) => w.startsWith(q))) return 400 + rankBonus;
  if (q.length <= 3 && airport.iata.toLowerCase().startsWith(q)) return 300 + rankBonus;
  // Too short for a meaningful misspelling: prefixes above already covered it.
  if (q.length < 4) return 0;
  // Per word as well as whole, so one misspelt word ("Changy") still finds a long name.
  const candidates = [name, city, ...words(name), ...words(city)];
  const sim = Math.max(...candidates.map((text) => similarity(qGrams, trigrams(text))));
  return sim >= TRIGRAM_FLOOR ? Math.round(sim * 200) + rankBonus : 0;
}

export function searchAirports(
  dataset: Pick<AirportDataset, 'airports' | 'metros'>,
  query: string,
  limit = 20,
): AirportHit[] {
  const q = foldForSearch(query);
  if (q.length === 0) return [];
  const qGrams = trigrams(q);
  const hits: AirportHit[] = [];
  for (const airport of dataset.airports) {
    const score = scoreAirport(airport, q, qGrams);
    if (score > 0) hits.push({ kind: 'airport', airport, score });
  }
  for (const metro of dataset.metros) {
    const city = foldForSearch(metro.city);
    const exact = q.length === 3 && metro.iata.toLowerCase() === q;
    // Metro rows sit just under the best airport of their city, never above an exact IATA hit.
    if (exact) hits.push({ kind: 'metro', metro, score: 995 });
    else if (city.startsWith(q)) hits.push({ kind: 'metro', metro, score: 625 });
  }
  return hits
    .sort((a, b) => b.score - a.score || hitIata(a).localeCompare(hitIata(b)))
    .slice(0, limit);
}

export function hitIata(hit: AirportHit): string {
  return hit.kind === 'airport' ? hit.airport.iata : hit.metro.iata;
}
