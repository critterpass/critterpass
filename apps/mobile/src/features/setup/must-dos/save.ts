/**
 * Builds the member's whole must-do list for `set_must_dos` (the server replaces their list with
 * it): what they have now plus one more, their first pick as the one primary. A new pick carries a
 * client id so the queued add and the synced row are the same row.
 */
import {
  generateUuidV7,
  MUST_DO_TITLE_MAX,
  MUST_DOS_PER_MEMBER,
  type SetMustDosPayload,
} from '@cp/domain';

import type { MustDoItem } from './model';

export interface NewPick {
  readonly text: string;
  readonly poiId: string | null;
}

function current(mine: readonly MustDoItem[]): SetMustDosPayload['items'] {
  // A row shared from a crewmate's pick is re-sent without its id: the server merges it again.
  return mine.map((item) => ({
    ...(item.mine ? { id: item.id } : {}),
    text: item.title,
    priority: item.primary ? 0 : 1,
    ...(item.poiId === null ? {} : { poi_id: item.poiId }),
  }));
}

/** Null when the member already has the most must-dos a list may hold. */
export function listWith(
  tripId: string,
  mine: readonly MustDoItem[],
  pick: NewPick,
  newId: () => string = generateUuidV7,
): SetMustDosPayload | null {
  if (mine.length >= MUST_DOS_PER_MEMBER) return null;
  const items = current(mine);
  const hasPrimary = items.some((item) => item.priority === 0);
  const text = pick.text.trim().slice(0, MUST_DO_TITLE_MAX);
  items.push({
    id: newId(),
    text,
    priority: hasPrimary ? 1 : 0,
    ...(pick.poiId === null ? {} : { poi_id: pick.poiId }),
  });
  return { trip_id: tripId, items };
}

/** The list without `id`; the next one up becomes the primary when the primary goes. */
export function listWithout(
  tripId: string,
  mine: readonly MustDoItem[],
  id: string,
): SetMustDosPayload {
  const items = current(mine.filter((item) => item.id !== id));
  if (items.length > 0 && !items.some((item) => item.priority === 0)) {
    const [first, ...rest] = items;
    if (first !== undefined)
      return { trip_id: tripId, items: [{ ...first, priority: 0 }, ...rest] };
  }
  return { trip_id: tripId, items };
}
