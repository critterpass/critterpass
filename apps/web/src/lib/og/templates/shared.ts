/* eslint-disable lingui/no-unlocalized-strings -- CSS values and font family names, not UI copy. */
/**
 * Building blocks every OG card shares: the palette (from @cp/design-tokens), the three faces the
 * renderer registers, the die-cut sticker and the brand strip along the bottom.
 */
import { tokens } from '@cp/design-tokens';
import type { ContainerNode, ImageNode, Node, TextNode } from '@takumi-rs/helpers';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const PALETTE = {
  ink: tokens.color.ink[850],
  inkRaised: tokens.color.ink[780],
  inkMuted: tokens.color.ink[200],
  paper: tokens.color.paper.base,
  paperBright: tokens.color.paper.bright,
  yellow: tokens.color.yellow,
  pink: tokens.color.pink,
  green: tokens.color.green.base,
  orange: tokens.color.orange,
  blue: tokens.color.blue,
} as const;

/**
 * The cards' own type scale in px. A 1200×630 card is read as a thumbnail, so it sets type far
 * larger than the app's scale; every size a template uses is named here.
 */
export const OG_TYPE = {
  hero: 112,
  headline: 104,
  headlineLong: 84,
  title: 96,
  titleLong: 76,
  tile: 44,
  wordmark: 34,
  body: 30,
  eyebrow: 24,
  chip: 22,
  mono: 22,
} as const;

export const FONT = { display: 'Archivo', body: 'Geist', mono: 'Geist Mono' } as const;

type Style = NonNullable<ContainerNode['style']>;

export function box(style: Style, children: Node[] = []): ContainerNode {
  return { type: 'container', style: { display: 'flex', ...style }, children };
}

export function line(text: string, style: Style): TextNode {
  return { type: 'text', text, style };
}

/** Display type: Archivo Black at the narrowest width, upper case. */
export function display(text: string, size: number, color: string): TextNode {
  return line(text.toLocaleUpperCase('en'), {
    fontFamily: FONT.display,
    fontWeight: 900,
    fontSize: size satisfies number,
    lineHeight: 0.86,
    color,
  });
}

export function eyebrow(text: string, color: string): TextNode {
  return line(text.toLocaleUpperCase('en'), {
    fontFamily: FONT.body,
    fontWeight: 600,
    fontSize: OG_TYPE.eyebrow,
    letterSpacing: 4,
    color,
  });
}

/** A baked critter sticker (`images` carries its bytes under `src`) with a white die-cut edge. */
export function sticker(src: string, size: number, rotate = 0): ImageNode {
  return {
    type: 'image',
    src,
    width: size,
    height: size,
    style: {
      transform: `rotate(${rotate}deg)`,
      filter: `drop-shadow(0 0 5px ${PALETTE.paperBright}) drop-shadow(0 6px 10px rgba(0,0,0,0.3))`,
    },
  };
}

/** The strip along the bottom of every card: the wordmark and the site. */
export function brandStrip(background: string, color: string): ContainerNode {
  return box(
    {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 64,
      padding: '0 56px',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: background,
    },
    [
      line('CRITTERPASS', {
        fontFamily: FONT.display,
        fontWeight: 900,
        fontSize: OG_TYPE.wordmark,
        color,
      }),
      line('critterpass.app', { fontFamily: FONT.mono, fontSize: OG_TYPE.mono, color }),
    ],
  );
}

export function chip(text: string, background: string, color: string): ContainerNode {
  return box(
    { padding: '10px 18px', borderRadius: 14, backgroundColor: background, marginRight: 12 },
    [
      line(text.toLocaleUpperCase('en'), {
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: OG_TYPE.chip,
        letterSpacing: 2,
        color,
      }),
    ],
  );
}
