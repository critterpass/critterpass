/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- colours, shadows and gradients the premium tokens do not carry yet */
/**
 * The crew chat's paint the premium tokens do not carry yet: its scrims, the grabber, translucent
 * text on ink, the menu shadow, and ring and fade builders over token colours.
 */
export const CHAT_PAINT = {
  sheetScrim: 'rgba(20,22,40,.3)',
  menuScrim: 'rgba(20,22,40,.12)',
  grabber: 'rgba(60,60,67,.3)',
  myReaction: 'rgba(255,95,168,.14)',
  onInkSoft: 'rgba(255,255,255,.6)',
  onInkMeta: 'rgba(255,255,255,.72)',
  menuShadow: '0 20px 40px -14px rgba(20,22,40,.35)',
} as const;

import { edgeGradient } from '@/ui/premium/shell/screens/scroll-edge';

/** The kit's flat ring, here beside the other paint. */
export { ring } from '@/ui/premium';

/**
 * The header's ground: solid ground for `solid` pt (the status bar and the controls), then fading
 * to the same colour at no opacity by `height`, so content scrolls away under it and never shows
 * behind the title.
 */
export function headerFade(ground: string, solid: number, height: number): string {
  return edgeGradient('top', height, solid, ground);
}
