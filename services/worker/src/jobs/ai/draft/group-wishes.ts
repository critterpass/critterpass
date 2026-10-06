/**
 * Typed must-dos still without a place, on a trip planned in day groups: which group each goes to
 * and the places the guide is offered for it there (`wishOffer`, as on a trip of one destination).
 *
 * A wish goes to the later group (a later stop, a day trip) with a recommended place it names,
 * else the later group where our search found a place it names, else the first group. It is
 * offered places of its own group only, so a wish is never answered with a place of another area.
 */
import { matchWish, type DraftPoi, type ResolvedWishes } from '@cp/planner';

import { wishOffer } from './plan-input';

export interface WishGroup {
  /** The destination's own words, which name no place ("Huế", "Vietnam"). */
  readonly ignore: readonly (readonly string[])[];
  /** The group's recommended places. */
  readonly places: readonly DraftPoi[];
  /** Places of the group's destination whose names share a word with a wish. */
  readonly candidates: readonly DraftPoi[];
}

export interface GroupWishes {
  /** Must-do id → the index of the group that plans it. */
  readonly home: ReadonlyMap<string, number>;
  /** Per group, what the guide is offered for the wishes it plans. */
  readonly offers: readonly ResolvedWishes[];
}

export function groupWishes(
  wishes: readonly { readonly id: string; readonly text: string }[],
  groups: readonly WishGroup[],
): GroupWishes {
  const names = (text: string, pick: (group: WishGroup) => readonly DraftPoi[]) =>
    groups.findIndex(
      (group, index) => index > 0 && matchWish(text, pick(group), group.ignore).named.length > 0,
    );
  const home = new Map(
    wishes.map((wish) => {
      const recommended = names(wish.text, (group) => group.places);
      const found =
        recommended === -1 ? names(wish.text, (group) => group.candidates) : recommended;
      return [wish.id, Math.max(0, found)] as const;
    }),
  );
  return {
    home,
    offers: groups.map((group, index) =>
      wishOffer(
        wishes.filter((wish) => home.get(wish.id) === index),
        group.candidates,
        group.ignore,
      ),
    ),
  };
}
