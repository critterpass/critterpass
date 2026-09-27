import { z } from 'zod';

import { text } from '../layout';
import type { CardLayout, LayoutNode } from '../model';
import {
  MONO_STYLE,
  POST_HEIGHT,
  POST_WIDTH,
  STORY_HEIGHT,
  STORY_WIDTH,
  TITLE_STYLE,
  baseCard,
} from './shared';

const receiptLineSchema = z.object({ label: z.string(), value: z.string() });

/** Recap receipt card (3m-6): the trip's costs itemised like a paper receipt, "saved as an image". */
export const recapReceiptPropsSchema = z.object({
  tripName: z.string(),
  lines: z.array(receiptLineSchema).min(1).max(10),
  total: z.string(),
});

export type RecapReceiptProps = z.infer<typeof recapReceiptPropsSchema>;

function lineNodes(
  lines: RecapReceiptProps['lines'],
  width: number,
  startY: number,
  rowHeight: number,
): LayoutNode[] {
  return lines.map((line, index) => {
    const y = startY + index * rowHeight;
    return text(
      90,
      y,
      width - 180,
      `${line.label}${'.'.repeat(Math.max(1, 40 - line.label.length - line.value.length))}${line.value}`,
      MONO_STYLE,
    );
  });
}

export function buildRecapReceipt(props: RecapReceiptProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, [
    text(90, 90, POST_WIDTH - 180, props.tripName, TITLE_STYLE, { maxLines: 2 }),
    ...lineNodes(props.lines, POST_WIDTH, 300, 60),
    text(
      90,
      300 + props.lines.length * 60 + 40,
      POST_WIDTH - 180,
      `TOTAL   ${props.total}`,
      MONO_STYLE,
    ),
  ]);
}

export function buildRecapReceiptStory(props: RecapReceiptProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, [
    text(90, 160, STORY_WIDTH - 180, props.tripName, TITLE_STYLE, { maxLines: 2 }),
    ...lineNodes(props.lines, STORY_WIDTH, 420, 66),
    text(
      90,
      420 + props.lines.length * 66 + 40,
      STORY_WIDTH - 180,
      `TOTAL   ${props.total}`,
      MONO_STYLE,
    ),
  ]);
}

export function recapReceiptAltText(props: RecapReceiptProps): string {
  return `${props.tripName} receipt, total ${props.total}`;
}
