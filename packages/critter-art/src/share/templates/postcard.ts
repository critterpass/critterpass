import { z } from 'zod';

import { image, rect, sticker, text } from '../layout';
import type { CardLayout } from '../model';
import { BODY_STYLE, PAPER, SCRIPT_STYLE, SUBTITLE_STYLE, TITLE_STYLE, watermark } from './shared';

export const POSTCARD_WIDTH = 1800;
export const POSTCARD_HEIGHT = 1200;
/** 1800x1200 @ 300dpi = a 6"x4" print-ready postcard; the screen preview renders the same layout at 1x. */
export const POSTCARD_PRINT_SCALE = 300 / 72;

/** Postcard front/back (3m-9): a full-bleed trip photo front, a handwritten-style message back. */
export const postcardPropsSchema = z.object({
  tripName: z.string(),
  city: z.string(),
  message: z.string(),
  senderName: z.string(),
  kind: z.string(),
  seed: z.number().int(),
  photoUri: z.string().optional(),
});

export type PostcardProps = z.infer<typeof postcardPropsSchema>;

function scaleLayout(layout: CardLayout, scale: number): CardLayout {
  if (scale === 1) return layout;
  const scaleNode = (node: CardLayout['nodes'][number]): CardLayout['nodes'][number] => {
    const scaled = { ...node, x: node.x * scale, y: node.y * scale };
    if (node.type === 'rect' || node.type === 'image') {
      return {
        ...scaled,
        w: node.w * scale,
        h: node.h * scale,
        ...(node.radius !== undefined ? { radius: node.radius * scale } : {}),
      } as typeof node;
    }
    if (node.type === 'sticker') return { ...scaled, size: node.size * scale } as typeof node;
    if (node.type === 'text') {
      return {
        ...scaled,
        w: node.w * scale,
        style: { ...node.style, fontSize: node.style.fontSize * scale },
        ...(node.lineHeight !== undefined ? { lineHeight: node.lineHeight * scale } : {}),
      } as typeof node;
    }
    if (node.type === 'frame')
      return {
        ...scaled,
        w: node.w * scale,
        h: node.h * scale,
        children: node.children.map(scaleNode),
      } as typeof node;
    return node;
  };
  return {
    width: Math.round(layout.width * scale),
    height: Math.round(layout.height * scale),
    ...(layout.background !== undefined ? { background: layout.background } : {}),
    nodes: layout.nodes.map(scaleNode),
  };
}

export function buildPostcardFront(props: PostcardProps): CardLayout {
  const width = POSTCARD_WIDTH;
  const height = POSTCARD_HEIGHT;
  return {
    width,
    height,
    background: PAPER,
    nodes: [
      rect(0, 0, width, height, PAPER),
      ...(props.photoUri
        ? [image(0, 0, width, height, { uri: props.photoUri }, { fit: 'cover' })]
        : []),
      sticker(width - 320, height - 320, 260, { kind: props.kind, seed: props.seed }),
      text(60, 60, width - 500, props.city, TITLE_STYLE, { maxLines: 1 }),
      watermark(width, height),
    ],
  };
}

export function buildPostcardBack(props: PostcardProps): CardLayout {
  const width = POSTCARD_WIDTH;
  const height = POSTCARD_HEIGHT;
  return {
    width,
    height,
    background: PAPER,
    nodes: [
      rect(0, 0, width, height, PAPER),
      rect(width / 2, 0, 2, height, 'rgba(33,29,24,0.2)'),
      text(80, 80, width / 2 - 160, props.message, SCRIPT_STYLE, { maxLines: 8, lineHeight: 56 }),
      text(80, height - 160, width / 2 - 160, `— ${props.senderName}`, BODY_STYLE),
      text(width / 2 + 80, 80, width / 2 - 160, props.tripName, SUBTITLE_STYLE, { maxLines: 2 }),
    ],
  };
}

export function buildPostcardFrontPrint(props: PostcardProps): CardLayout {
  return scaleLayout(buildPostcardFront(props), POSTCARD_PRINT_SCALE);
}

export function buildPostcardBackPrint(props: PostcardProps): CardLayout {
  return scaleLayout(buildPostcardBack(props), POSTCARD_PRINT_SCALE);
}

export function postcardAltText(props: PostcardProps): string {
  return `Postcard from ${props.city}: ${props.message}`;
}
