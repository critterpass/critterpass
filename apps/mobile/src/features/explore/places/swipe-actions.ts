/**
 * Swiping a row in the places list (7c-3): right saves the place to the trip's Ideas, left hides it
 * from me. Past the threshold (or a quick flick) the row acts; anything shorter springs back. The
 * row moves at once (a pending action laid over the synced places) and the command waits in the
 * offline queue when there is no signal; undo sends the opposite command and lifts the overlay.
 * An action stays pending until the synced rows show it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and payload keys, never copy. */
import type { HubPlace } from './places-model';

export type SwipeAction = 'save' | 'hide';

/** A drag this share of the row's width acts. */
export const SWIPE_SHARE = 0.35;
/** A flick this fast (pt/s) over at least `FLICK_MIN_PT` acts too. */
export const FLICK_SPEED = 900;
export const FLICK_MIN_PT = 48;

/** What a released drag does: right saves, left hides, short and slow drags do nothing. */
export function swipeOutcome(
  translationX: number,
  velocityX: number,
  width: number,
  rtl = false,
): SwipeAction | null {
  const along = rtl ? -translationX : translationX;
  const speed = rtl ? -velocityX : velocityX;
  const far = Math.abs(along) >= width * SWIPE_SHARE;
  const flick =
    Math.abs(along) >= FLICK_MIN_PT && Math.abs(speed) >= FLICK_SPEED && speed * along > 0;
  if (!far && !flick) return null;
  return along > 0 ? 'save' : 'hide';
}

export interface PendingAction {
  readonly action: SwipeAction;
  readonly poiId: string;
  /** The idea id the save asked for, so undo removes exactly that backing. */
  readonly ideaId: string | null;
}

export type Pending = ReadonlyMap<string, PendingAction>;

export function withPending(pending: Pending, next: PendingAction): Pending {
  const copy = new Map(pending);
  copy.set(next.poiId, next);
  return copy;
}

export function withoutPending(pending: Pending, poiId: string): Pending {
  if (!pending.has(poiId)) return pending;
  const copy = new Map(pending);
  copy.delete(poiId);
  return copy;
}

/** Drops the actions the synced places already show (saved now listed as saved, hidden gone). */
export function settlePending(pending: Pending, synced: readonly HubPlace[]): Pending {
  if (pending.size === 0) return pending;
  const byPoi = new Map(
    synced.flatMap((place) => (place.poiId === null ? [] : [[place.poiId, place] as const])),
  );
  let next = pending;
  for (const [poiId, entry] of pending) {
    const place = byPoi.get(poiId);
    const shown =
      entry.action === 'save'
        ? place?.standing === 'saved' || place?.standing === 'plan'
        : place === undefined;
    if (shown) next = withoutPending(next, poiId);
  }
  return next;
}

/** The places with the pending actions laid over: a save shows as saved by me, a hide is gone. */
export function overlayPending(
  places: readonly HubPlace[],
  pending: Pending,
  me: string | null,
): HubPlace[] {
  if (pending.size === 0) return [...places];
  return places.flatMap((place) => {
    const entry = place.poiId === null ? undefined : pending.get(place.poiId);
    if (entry === undefined || place.standing === 'plan') return [place];
    if (entry.action === 'hide') return [];
    if (place.standing === 'saved') return [place];
    return [
      {
        ...place,
        standing: 'saved' as const,
        ideaId: entry.ideaId,
        backerIds: me === null ? [] : [me],
      },
    ];
  });
}

export interface CommandCall {
  readonly name: 'save_idea' | 'remove_idea' | 'hide_place' | 'unhide_place';
  readonly payload: Readonly<Record<string, string>>;
}

/** The command an action sends. */
export function actionCommand(tripId: string, entry: PendingAction): CommandCall {
  if (entry.action === 'hide') return { name: 'hide_place', payload: { poi_id: entry.poiId } };
  return {
    name: 'save_idea',
    payload: {
      trip_id: tripId,
      poi_id: entry.poiId,
      source: 'save',
      ...(entry.ideaId === null ? {} : { idea_id: entry.ideaId }),
    },
  };
}

/** The command that takes an action back. */
export function undoCommand(entry: PendingAction): CommandCall | null {
  if (entry.action === 'hide') return { name: 'unhide_place', payload: { poi_id: entry.poiId } };
  return entry.ideaId === null ? null : { name: 'remove_idea', payload: { idea_id: entry.ideaId } };
}
