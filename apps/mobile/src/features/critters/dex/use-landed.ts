/**
 * A critter that has just been added to the pass: the dex scrolls to the row of the set it joined
 * (when that is one of the ranked places; the home and here-now sets sit at the top already) and
 * shows it outlined for a moment.
 */
import type { FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef, useState } from 'react';

/** How long the set a critter landed in stays outlined. */
const LANDED_MS = 2400;

export function useLanded<Item>(
  /** The critter that landed, or null when none did (or its set is not in the dex). */
  landed: string | null,
  /** Its set's row in the list, or -1 when the set sits in the header. */
  index: number,
  onShown: (() => void) | undefined,
) {
  const list = useRef<FlashListRef<Item>>(null);
  const [done, setDone] = useState<string | null>(null);
  const after = useRef(onShown);
  useEffect(() => {
    after.current = onShown;
  }, [onShown]);
  useEffect(() => {
    if (landed === null) return undefined;
    if (index >= 0) void list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    const timer = setTimeout(() => {
      setDone(landed);
      after.current?.();
    }, LANDED_MS);
    return () => clearTimeout(timer);
  }, [landed, index]);
  return { list, shown: landed !== null && done !== landed };
}
