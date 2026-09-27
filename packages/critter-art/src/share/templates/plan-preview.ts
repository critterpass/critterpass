import { z } from 'zod';

import { sticker, text } from '../layout';
import type { CardLayout, LayoutNode } from '../model';
import {
  BODY_STYLE,
  POST_HEIGHT,
  POST_WIDTH,
  SUBTITLE_STYLE,
  TITLE_STYLE,
  baseCard,
} from './shared';

const planMemberSchema = z.object({ name: z.string(), kind: z.string(), seed: z.number().int() });

/** Plan share image (3o-4): the plan's title, dates and who's coming. */
export const planPreviewPropsSchema = z.object({
  planName: z.string(),
  dateRange: z.string(),
  members: z.array(planMemberSchema).min(1).max(6),
});

export type PlanPreviewProps = z.infer<typeof planPreviewPropsSchema>;

function memberNodes(
  members: readonly { readonly name: string; readonly kind: string; readonly seed: number }[],
  width: number,
  y: number,
): LayoutNode[] {
  const spacing = width / (members.length + 1);
  return members.flatMap((member, index) => {
    const x = (index + 1) * spacing;
    return [
      sticker(x - 60, y, 120, { kind: member.kind, seed: member.seed }),
      text(x - 100, y + 140, 200, member.name, BODY_STYLE, { align: 'center' }),
    ];
  });
}

export function buildPlanPreview(props: PlanPreviewProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, [
    text(90, 90, POST_WIDTH - 180, props.planName, TITLE_STYLE, { maxLines: 2 }),
    text(90, 220, POST_WIDTH - 180, props.dateRange, SUBTITLE_STYLE),
    ...memberNodes(props.members, POST_WIDTH, 500),
  ]);
}

export function planPreviewAltText(props: PlanPreviewProps): string {
  return `${props.planName}, ${props.dateRange}, with ${props.members.map((m) => m.name).join(', ')}`;
}
