/* eslint-disable lingui/no-unlocalized-strings -- SVG path data, never rendered copy. */
/**
 * The premium line icons: 24-grid paths copied from the Foundations design's inline SVGs, with the
 * stroke width each one is drawn at there. Circles and rects are written as path arcs so every glyph
 * is one path.
 */

export interface PremiumGlyph {
  readonly d: string;
  readonly stroke: number;
  /** Drawn filled rather than stroked (the "more" dots). */
  readonly fill?: boolean;
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

export const PREMIUM_GLYPHS = {
  back: { d: 'M15 6l-6 6 6 6', stroke: 2.4 },
  forward: { d: 'M9 6l6 6-6 6', stroke: 2.6 },
  // The picker chevron (⌄) after a chip's value: tapping it opens the choices.
  down: { d: 'M6 9.5l6 6 6-6', stroke: 2.4 },
  close: { d: 'M6 6l12 12M18 6 6 18', stroke: 2.4 },
  plus: { d: 'M12 5v14M5 12h14', stroke: 2.6 },
  minus: { d: 'M5 12h14', stroke: 2.6 },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5', stroke: 3 },
  share: { d: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6', stroke: 2.2 },
  send: { d: 'M12 19V5M6 11l6-6 6 6', stroke: 2.4 },
  retry: { d: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4', stroke: 2.3 },
  offline: {
    d: 'M2 8.5a15 15 0 0 1 5-3M22 8.5a15 15 0 0 0-11-4M5.5 12a10 10 0 0 1 3-2M18.5 12a10 10 0 0 0-4-2.3M9 15.5a5 5 0 0 1 6 0M12 19.5h.01M3 3l18 18',
    stroke: 2.3,
  },
  edit: { d: 'M4 20h4L19 9l-4-4L4 16z', stroke: 2.3 },
  people: {
    d: `${circle(9, 8, 3.2)}M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 6M21 20a5.5 5.5 0 0 0-4-5.3`,
    stroke: 2.3,
  },
  bolt: { d: 'M9 3h6l-1 6h3l-6 12 1-8H8z', stroke: 2 },
  camera: {
    d: `M6 7h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z${circle(12, 13.5, 3.5)}M8 7l1.5-3h5L16 7`,
    stroke: 2,
  },
  pin: {
    d: `M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z${circle(12, 10, 2.3)}`,
    stroke: 2.4,
  },
  mic: {
    d: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
    stroke: 2.2,
  },
  expand: { d: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7', stroke: 2.6 },
  heart: { d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', stroke: 2.2 },
  lock: {
    d: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
    stroke: 2.4,
  },
  search: { d: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20', stroke: 2.2 },
  gear: {
    d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
    stroke: 2,
  },
  // The system paste glyph's shape (a clipboard), for the kit's paste pill.
  paste: {
    d: 'M9 3.5h6v3H9zM7.5 5H6a1.5 1.5 0 0 0-1.5 1.5v12.5A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5V6.5A1.5 1.5 0 0 0 18 5h-1.5',
    stroke: 2,
  },
  more: { d: `${circle(5, 12, 2)}${circle(12, 12, 2)}${circle(19, 12, 2)}`, stroke: 0, fill: true },
  // Menu and row actions, one meaning per glyph (5.04, 4.29, 3.09, 2.08, 7.04, 7.24, 9.02).
  reply: { d: 'M9.5 7 5 11.5 9.5 16M5 11.5h9a5 5 0 0 1 5 5V18', stroke: 2 },
  pushpin: { d: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7', stroke: 2 },
  copy: { d: 'M9 9h11v11H9zM5 15H4V4h11v1', stroke: 2.1 },
  flag: { d: 'M6 21V4M6 4.5h11.5l-2.5 4 2.5 4H6', stroke: 2 },
  trash: { d: 'M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7', stroke: 2 },
  calendar: { d: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4', stroke: 2 },
  clock: { d: `${circle(12, 12, 9)}M12 7v5l3 2`, stroke: 2.1 },
  bell: { d: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0', stroke: 2.1 },
  car: {
    d: `M5 16v-4l2-5h10l2 5v4zM5 12h14M5 16v2.5M19 16v2.5${circle(8, 14, 0.6)}${circle(16, 14, 0.6)}`,
    stroke: 2,
  },
  chat: { d: 'M4 5h16v11H9.5L4 20z', stroke: 2 },
  qr: {
    d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h2.5M20 14v2.5',
    stroke: 2,
  },
  photos: {
    d: `M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z${circle(9, 10, 1.6)}M21 16l-5-5-8 8`,
    stroke: 2,
  },
  swap: { d: 'M4 8h15M15.5 4.5 19 8l-3.5 3.5M20 16H5M8.5 12.5 5 16l3.5 3.5', stroke: 2 },
  arrowRight: { d: 'M5 12h14M13 6l6 6-6 6', stroke: 2.2 },
  download: { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14', stroke: 2.1 },
  arrowUp: { d: 'M12 19V5M6 11l6-6 6 6', stroke: 2.2 },
  appearance: {
    d: `${circle(12, 12, 4)}M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5`,
    stroke: 2,
  },
  home: { d: 'M4 10.5 12 4l8 6.5V20h-5v-5.5h-6V20H4z', stroke: 1.9 },
  ticket: {
    d: 'M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3.5v3h-17v-3a1.8 1.8 0 0 0 0-3.5z',
    stroke: 1.9,
  },
  wallet: { d: 'M3.5 6h17v13h-17zM3.5 10h17', stroke: 1.9 },
  pass: {
    d: 'M5.5 3.5h13v17h-13zM9.5 16.5h5M12 8a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    stroke: 1.9,
  },
} as const satisfies Record<string, PremiumGlyph>;

export type PremiumIconName = keyof typeof PREMIUM_GLYPHS;
