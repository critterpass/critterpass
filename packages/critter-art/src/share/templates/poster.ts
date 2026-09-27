import { z } from 'zod';

import { sticker, text } from '../layout';
import type { CardLayout, LayoutNode } from '../model';
import { POST_HEIGHT, POST_WIDTH, SUBTITLE_STYLE, TITLE_STYLE, baseCard } from './shared';

const posterEntrySchema = z.object({ kind: z.string(), seed: z.number().int(), label: z.string() });

/** Vote/plan poster (3o-4, 5b content-ext poster): a grid of candidate critters/stops to vote on. */
export const posterPropsSchema = z.object({
  title: z.string(),
  entries: z.array(posterEntrySchema).min(1).max(9),
});

export type PosterProps = z.infer<typeof posterPropsSchema>;

function gridNodes(entries: PosterProps['entries'], width: number, startY: number): LayoutNode[] {
  const columns = 3;
  const cellSize = (width - 180) / columns;
  return entries.flatMap((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = 90 + col * cellSize;
    const y = startY + row * (cellSize + 60);
    return [
      sticker(x + (cellSize - 160) / 2, y, 160, { kind: entry.kind, seed: entry.seed }),
      text(x, y + 180, cellSize, entry.label, SUBTITLE_STYLE, { align: 'center', maxLines: 1 }),
    ];
  });
}

export function buildPoster(props: PosterProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, [
    text(90, 90, POST_WIDTH - 180, props.title, TITLE_STYLE, { align: 'center', maxLines: 2 }),
    ...gridNodes(props.entries, POST_WIDTH, 280),
  ]);
}

export function posterAltText(props: PosterProps): string {
  return `${props.title}: ${props.entries.map((e) => e.label).join(', ')}`;
}
