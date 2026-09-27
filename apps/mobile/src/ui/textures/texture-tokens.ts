import { tokens } from '@cp/design-tokens';

import { parseDotLayer } from './geometry';

/**
 * The `texture.*` tokens (docs/design-system.md §1.7) narrowed to the shapes the texture
 * components draw. The token schema types each texture value loosely, so a missing or reshaped
 * field fails loudly here, at import, rather than drawing nothing.
 */
type Raw = Readonly<Record<string, unknown>>;

function field<T>(group: Raw, key: string, check: (value: unknown) => value is T): T {
  const value = group[key];
  if (!check(value)) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error(`design-tokens: texture field "${key}" is missing or mistyped`);
  }
  return value;
}
const isNumber = (value: unknown): value is number => typeof value === 'number';
const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const t = tokens.texture as unknown as Readonly<Record<string, Raw>>;
const group = (name: string): Raw => t[name] ?? {};

const halftone = group('halftone');
const halftoneDark = group('halftoneDark');
const guilloche = group('guilloche');
const hatch = group('hatch');
const engraving = group('engraving');
const barcode = group('barcode');
const rays = group('rays');
const holo = group('holo');
const sheen = group('sheen');

export const TEXTURE = {
  halftone: {
    color: field(halftone, 'color', isString),
    radius: field(halftone, 'radiusPt', isNumber),
    grid: field(halftone, 'gridPt', isNumber),
  },
  halftoneDark: { layers: field(halftoneDark, 'layers', isStrings).map(parseDotLayer) },
  guilloche: {
    color: field(guilloche, 'color', isString),
    lineWidth: field(guilloche, 'ringWidthMinPt', isNumber),
    pitch: field(guilloche, 'ringWidthMaxPt', isNumber),
    originX: field(guilloche, 'originPercentX', isNumber) / 100,
    originY: field(guilloche, 'originPercentY', isNumber) / 100,
  },
  hatch: {
    angle: field(hatch, 'angleDeg', isNumber),
    color: field(hatch, 'color', isString),
    width: field(hatch, 'stripeWidthPt', isNumber),
    gap: field(hatch, 'stripeGapPt', isNumber),
    base: field(hatch, 'baseColor', isString),
  },
  engraving: {
    angle: field(engraving, 'angleDeg', isNumber),
    color: field(engraving, 'color', isString),
    width: field(engraving, 'lineWidthPt', isNumber),
    gap: field(engraving, 'lineGapPt', isNumber),
  },
  barcode: {
    color: field(barcode, 'color', isString),
    bar: field(barcode, 'stripeWidthPt', isNumber),
    gap: field(barcode, 'stripeGapPt', isNumber),
  },
  rays: {
    color: field(rays, 'color', isString),
    opacity: field(rays, 'opacity', isNumber),
    step: field(rays, 'stepDeg', isNumber),
  },
  holo: {
    colors: field(holo, 'colors', isStrings),
    animated: field(holo, 'animated', isBoolean),
  },
  sheen: {
    skew: field(sheen, 'skewDeg', isNumber),
    width: field(sheen, 'widthPt', isNumber),
    color: field(sheen, 'color', isString),
  },
} as const;
