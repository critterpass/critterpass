/**
 * The rows under the add sheet's field, in order. The typed words' own row ("Keep it just as you
 * typed it") comes first, right under the field, and everything the search finds follows it: places
 * that land while the traveller reaches for that row never push it down, so a tap on it never picks
 * a place instead.
 */
import type { PlaceResult, SearchState } from './search';

export type AddSheetRow =
  | { readonly kind: 'keep' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'found' }
  | { readonly kind: 'place'; readonly place: PlaceResult }
  | { readonly kind: 'offline' }
  | { readonly kind: 'none'; readonly offline: boolean }
  | { readonly kind: 'closed' };

export function addSheetRows(typed: string, search: SearchState): AddSheetRow[] {
  if (typed === '') return [];
  const results = search.kind === 'done' ? search.results : [];
  const open = results.filter((result) => result.pill?.kind !== 'clash');
  const closed = results.filter((result) => result.pill?.kind === 'clash');
  const place = (result: PlaceResult): AddSheetRow => ({ kind: 'place', place: result });
  const rows: AddSheetRow[] = [{ kind: 'keep' }];
  if (search.kind === 'loading') rows.push({ kind: 'loading' });
  if (open.length > 0) rows.push({ kind: 'found' }, ...open.map(place));
  if (search.kind === 'done' && search.offline && results.length > 0)
    rows.push({ kind: 'offline' });
  if (search.kind === 'done' && results.length === 0) {
    rows.push({ kind: 'none', offline: search.offline });
  }
  if (closed.length > 0) rows.push({ kind: 'closed' }, ...closed.map(place));
  return rows;
}
