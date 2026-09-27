import { z } from 'zod';

import { sticker, text } from '../layout';
import type { CardLayout, LayoutNode } from '../model';
import {
  BODY_STYLE,
  POST_HEIGHT,
  POST_WIDTH,
  STORY_HEIGHT,
  STORY_WIDTH,
  TITLE_STYLE,
  baseCard,
} from './shared';

const routeStopSchema = z.object({ city: z.string(), kind: z.string(), seed: z.number().int() });

/** Recap route card (3m-4): the trip's stops in order, each with the guide critter met there. */
export const recapRoutePropsSchema = z.object({
  tripName: z.string(),
  stops: z.array(routeStopSchema).min(1).max(8),
});

export type RecapRouteProps = z.infer<typeof recapRoutePropsSchema>;

function stopNodes(
  stops: RecapRouteProps['stops'],
  width: number,
  startY: number,
  rowHeight: number,
): LayoutNode[] {
  return stops.flatMap((stop, index) => {
    const y = startY + index * rowHeight;
    return [
      sticker(90, y, 80, { kind: stop.kind, seed: stop.seed }),
      text(190, y + 22, width - 280, stop.city, BODY_STYLE),
    ];
  });
}

export function buildRecapRoute(props: RecapRouteProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, [
    text(90, 90, POST_WIDTH - 180, props.tripName, TITLE_STYLE, { maxLines: 2 }),
    ...stopNodes(props.stops, POST_WIDTH, 320, 130),
  ]);
}

export function buildRecapRouteStory(props: RecapRouteProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, [
    text(90, 140, STORY_WIDTH - 180, props.tripName, TITLE_STYLE, { maxLines: 2 }),
    ...stopNodes(props.stops, STORY_WIDTH, 420, 150),
  ]);
}

export function recapRouteAltText(props: RecapRouteProps): string {
  return `${props.tripName}: ${props.stops.map((s) => s.city).join(', ')}`;
}
