/* eslint-disable lingui/no-unlocalized-strings -- SVG path data, never rendered copy. */
/**
 * Line icons the trip and wallet screens draw that the premium kit's set does not have yet (search,
 * bell, the booking kinds, money and safety marks). Same 24 grid, round joins and stroke family as
 * the kit's glyphs, so they sit next to them; a candidate for the kit's own set.
 */

export interface LineGlyph {
  readonly d: string;
  readonly stroke: number;
}

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

export const LINE_GLYPHS = {
  search: { d: `${circle(11, 11, 6.5)}M16 16l4.5 4.5`, stroke: 2.3 },
  bell: { d: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0', stroke: 2.2 },
  plane: {
    d: 'M2.5 13.5l8-2.5V5.5a1.5 1.5 0 0 1 3 0V11l8 2.5v2l-8-1.5v4l2.5 1.6V21L12 20l-4 1v-1.4l2.5-1.6v-4l-8 1.5z',
    stroke: 1.9,
  },
  bed: { d: `M3 19V6M3 14h18v5M21 14a3 3 0 0 0-3-3h-7v3${circle(7, 11, 1.8)}`, stroke: 2 },
  boat: { d: 'M3 15l2 5h14l2-5zM12 3v12M12 4.5l6 8.5h-6', stroke: 2 },
  car: {
    d: `M5 16v-4l2-5h10l2 5v4zM5 12h14M5 16v2.5M19 16v2.5${circle(8, 14, 0.6)}${circle(16, 14, 0.6)}`,
    stroke: 2,
  },
  train: {
    d: 'M7 3h10a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 11h14M8 21l2-3M16 21l-2-3',
    stroke: 2,
  },
  receipt: { d: 'M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 12h6M9 16h3', stroke: 2 },
  card: { d: 'M3 6h18v12H3zM3 10h18M7 15h4', stroke: 2 },
  link: {
    d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    stroke: 2.2,
  },
  mail: { d: 'M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6', stroke: 2 },
  phone: {
    d: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
    stroke: 2,
  },
  alert: { d: 'M12 3.5l9.5 17h-19zM12 10v4.5M12 17.5h.01', stroke: 2.2 },
  info: { d: `${circle(12, 12, 9)}M12 11v6M12 7.5h.01`, stroke: 2.2 },
  sun: {
    d: `${circle(12, 12, 4)}M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4`,
    stroke: 2,
  },
  rain: {
    d: 'M7 15a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 17 15zM8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5',
    stroke: 2,
  },
  moon: { d: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', stroke: 2 },
  clock: { d: `${circle(12, 12, 9)}M12 7v5l3 2`, stroke: 2.2 },
  calendar: { d: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4', stroke: 2 },
  map: { d: 'M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20', stroke: 2 },
  navigate: { d: 'M4 11l16-7-7 16-2-7z', stroke: 2.2 },
  shield: { d: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', stroke: 2 },
  qr: {
    d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h2.5M20 14v2.5',
    stroke: 2,
  },
  scan: { d: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16', stroke: 2.2 },
  chat: { d: 'M4 5h16v11H9.5L4 20z', stroke: 2 },
  copy: { d: 'M9 9h11v11H9zM5 15H4V4h11v1', stroke: 2.2 },
  download: { d: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14', stroke: 2.2 },
  chart: { d: 'M4 20V10M10 20V4M16 20v-7M21 20H3', stroke: 2.2 },
  brightness: {
    d: `${circle(12, 12, 3.5)}M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1`,
    stroke: 2,
  },
  walk: {
    d: `${circle(13, 4.5, 1.8)}M10 21l2-6 2.5 2.5V21M8 12l2.5-4.5 3 1 2 3.5 2.5 1M12.5 15l.5-6`,
    stroke: 2,
  },
  food: { d: 'M7 3v7a2 2 0 0 0 4 0V3M9 12v9M16.5 3c-2.2 2-2.2 6.5 0 8.5V21', stroke: 2.1 },
  wallet: { d: 'M3.5 6.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15zM3.5 6.5l11-3v3M16 13h2', stroke: 2 },
  camera: {
    d: 'M4 8h3.5L9 5.5h6L16.5 8H20v11H4zM12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    stroke: 2,
  },
  star: {
    d: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 9.7l5.9-.8z',
    stroke: 2,
  },
} as const satisfies Record<string, LineGlyph>;

export type LineIconName = keyof typeof LINE_GLYPHS;
