/** Trying the orders of a day's stops (./sequence). */

/** Pairs of stops in `order` swapped from the guide's order. */
export function inversions(order: readonly number[]): number {
  let count = 0;
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      if ((order[i] as number) > (order[j] as number)) count += 1;
    }
  }
  return count;
}

/** Every order of `items` (Heap's algorithm). */
export function* permutations(items: number[], k = items.length): Generator<number[]> {
  if (k <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < k; i += 1) {
    yield* permutations(items, k - 1);
    const j = k % 2 === 0 ? i : 0;
    [items[j], items[k - 1]] = [items[k - 1] as number, items[j] as number];
  }
}

/** Rounds of moves tried on a day too long to search every order of. */
const MOVE_ROUNDS = 6;
/** The longest run of neighbouring stops moved together (an area's morning, say). */
const MAX_RUN = 3;

export interface Scored {
  readonly order: number[];
  readonly key: readonly number[];
}

/**
 * A long day's order improved a few stops at a time: each round moves every run of up to three
 * neighbouring stops to every other seat and keeps the best order found, until a round finds
 * nothing better. Lunch across the river between two temples is fixed by moving one stop, and an
 * area's two sights seen at both ends of the day by moving the pair, as a person would fix them.
 */
export function improveByMoves(
  start: Scored,
  keyOf: (order: readonly number[]) => readonly number[],
  better: (a: readonly number[], b: readonly number[]) => boolean,
): Scored {
  let best = start;
  const size = start.order.length;
  for (let round = 0; round < MOVE_ROUNDS; round += 1) {
    let found = best;
    for (let run = 1; run <= Math.min(MAX_RUN, size - 1); run += 1) {
      for (let from = 0; from + run <= size; from += 1) {
        const rest = [...best.order];
        const moved = rest.splice(from, run);
        for (let to = 0; to <= rest.length; to += 1) {
          if (to === from) continue;
          const order = [...rest.slice(0, to), ...moved, ...rest.slice(to)];
          const key = keyOf(order);
          if (better(key, found.key)) found = { order, key };
        }
      }
    }
    if (found === best) break;
    best = found;
  }
  return best;
}
