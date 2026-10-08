/**
 * Keeps a block of small print whole on a scrolling page that ends at a fixed footer: where the
 * page's lower edge would cut through the block before any scroll, the block starts below that
 * edge instead, one scroll away and complete.
 */
import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** How far down to push a block at `y`, `height` tall, so `viewport`'s edge does not cut it. */
export function pushBelowEdge(viewport: number, y: number, height: number): number {
  return viewport > 0 && y < viewport && y + height > viewport ? viewport - y : 0;
}

export function useWholeBlockBelow() {
  const [viewport, setViewport] = useState(0);
  const [block, setBlock] = useState<{ y: number; height: number } | null>(null);
  const push = block === null ? 0 : pushBelowEdge(viewport, block.y, block.height);
  return {
    push,
    onViewport: (event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.height),
    onBlock: ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
      // Where the block would sit without the push, so the push never feeds itself.
      const next = { y: layout.y - push, height: layout.height };
      setBlock((now) =>
        now !== null && now.y === next.y && now.height === next.height ? now : next,
      );
    },
  };
}
