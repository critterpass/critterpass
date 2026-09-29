/**
 * Where a new candidate lands: the board registers its view while it is on screen, and the pitch
 * sheet flies the pitched card onto it (the overlay clone arcs, pops and thuds, docs/design-system
 * §3.4) before the toast. With no board on screen the card simply leaves with the sheet.
 */
import type { ComponentRef, ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

import { flyTo } from '@/motion';

type ViewRef = RefObject<ComponentRef<typeof View> | null>;

let landing: ViewRef | null = null;

/** The board's view while it is mounted; returns the unregister function. */
export function registerBoardLanding(ref: ViewRef): () => void {
  landing = ref;
  return () => {
    if (landing === ref) landing = null;
  };
}

export async function flyToBoard(source: ViewRef, node: ReactNode): Promise<boolean> {
  if (landing === null || source.current === null) return false;
  try {
    await flyTo(source, landing, node);
    return true;
  } catch {
    return false;
  }
}
