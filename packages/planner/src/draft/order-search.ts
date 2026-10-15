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
