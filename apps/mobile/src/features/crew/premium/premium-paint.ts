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

/** The kit's flat ring, here beside the other paint. */
export { ring } from '@/ui/premium';

/** The header's fade from the ground colour so content scrolls away under it. */
export function headerFade(ground: string): string {
  return `linear-gradient(180deg, ${ground} 62%, transparent)`;
}
