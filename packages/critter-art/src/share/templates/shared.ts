import { TIER_COLORS } from '../../forms/tier-palette';
import { rect, text } from '../layout';
import type { CardLayout, LayoutNode, TextRunStyle } from '../model';

// Mirrors design-tokens' `color.paper.base`/`color.ink[950]` (docs/design-system.md) — kept as
// local constants rather than a runtime `@cp/design-tokens` dependency, the same "pure renderer
// core" tradeoff `../../forms/tier-palette.ts` already makes for tier colours.
export const PAPER = '#f4efe4';
export const INK = '#211d18';
export const INK_MUTED = 'rgba(33,29,24,0.6)';

export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;
export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

export const TITLE_STYLE: TextRunStyle = {
  fontFamily: 'Archivo',
  fontWeight: 800,
  color: INK,
  fontSize: 64,
};
export const SUBTITLE_STYLE: TextRunStyle = {
  fontFamily: 'Geist',
  fontWeight: 500,
  color: INK_MUTED,
  fontSize: 32,
};
export const BODY_STYLE: TextRunStyle = {
  fontFamily: 'Geist',
  fontWeight: 400,
  color: INK,
  fontSize: 28,
};
export const MONO_STYLE: TextRunStyle = {
  fontFamily: 'GeistMono',
  fontWeight: 400,
  color: INK,
  fontSize: 26,
};
export const SCRIPT_STYLE: TextRunStyle = {
  fontFamily: 'Caveat',
  fontWeight: 600,
  color: INK,
  fontSize: 40,
};

const WATERMARK_STYLE: TextRunStyle = {
  fontFamily: 'Geist',
  fontWeight: 500,
  color: INK_MUTED,
  fontSize: 22,
};

/** The "critterpass.app" footer every share card carries. */
export function watermark(width: number, height: number): LayoutNode {
  return text(0, height - 56, width, 'critterpass.app', WATERMARK_STYLE, { align: 'center' });
}

export function baseCard(width: number, height: number, nodes: readonly LayoutNode[]): CardLayout {
  return {
    width,
    height,
    background: PAPER,
    nodes: [rect(0, 0, width, height, PAPER), ...nodes, watermark(width, height)],
  };
}

/** A tier-accent edge bar, for cards that borrow the CritterDex's rarity colour language (recap awards, poster). */
export function tierAccentBar(width: number, rarity: keyof typeof TIER_COLORS): LayoutNode {
  return rect(0, 0, width, 12, TIER_COLORS[rarity].accent);
}
