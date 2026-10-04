/**
 * The places list as one flat run of items for a virtualised list: each group's title and rows,
 * the one IN THE PLAN row, and at most one labelled sponsored row among Tokek's suggestions (third,
 * when the sponsored place is one of them).
 */
/* eslint-disable lingui/no-unlocalized-strings -- list keys, never copy. */
import type { PlaceGroups } from './place-groups';
import type { HubPlace } from './places-model';

export type ListItem =
  | { readonly kind: 'title'; readonly key: string; readonly group: 'saved' | 'plan' | 'suggests' }
  | {
      readonly kind: 'place';
      readonly key: string;
      readonly place: HubPlace;
      readonly sponsored: boolean;
    }
  | { readonly kind: 'plan'; readonly key: string };

/** Where the sponsored row joins Tokek's suggestions. */
export const SPONSORED_AT = 2;

export function listItems(groups: PlaceGroups, sponsoredPoiId: string | null): ListItem[] {
  const items: ListItem[] = [];
  const rows = (places: readonly HubPlace[], prefix: string) =>
    places.map((place): ListItem => ({
      kind: 'place',
      key: `${prefix}:${place.id}`,
      place,
      sponsored: false,
    }));
  if (groups.saved.length > 0) {
    items.push({ kind: 'title', key: 'title:saved', group: 'saved' }, ...rows(groups.saved, 's'));
  }
  if (groups.plan.length > 0) {
    items.push({ kind: 'title', key: 'title:plan', group: 'plan' }, { kind: 'plan', key: 'plan' });
  }
  if (groups.suggests.length > 0) {
    let suggests = rows(groups.suggests, 't');
    const paid =
      sponsoredPoiId === null
        ? -1
        : groups.suggests.findIndex((place) => place.poiId === sponsoredPoiId);
    const entry = suggests[paid];
    if (paid >= 0 && entry?.kind === 'place' && groups.suggests.length > 1) {
      const rest = suggests.filter((_, index) => index !== paid);
      const at = Math.min(SPONSORED_AT, rest.length);
      suggests = [...rest.slice(0, at), { ...entry, sponsored: true }, ...rest.slice(at)];
    }
    items.push({ kind: 'title', key: 'title:suggests', group: 'suggests' }, ...suggests);
  }
  return items;
}
