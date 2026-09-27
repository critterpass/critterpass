/**
 * Flattens the resolved token tree into leaves the CSS/Swift/Kotlin emitters can each turn into
 * one native variable: colours, plain numbers/strings, cubic-bezier arrays and shadow structs.
 * `motion.duration.*` and `motion.easing.*` come along too (plain ms values and bezier curves have
 * an obvious CSS/native equivalent); `motion.spring`, `motion.transition` and `motion.gesture` stay
 * TS-only (Reanimated-only choreography — native surfaces use static poses per design-system.md
 * §3.5), as does `texture` (Skia shader parameters) and `sound` (an asset/haptic manifest, not a
 * style value). `type.*` keeps only the fields a native `Font` helper or a CSS custom property can
 * use directly; the OS Dynamic Type damping and per-script overrides stay app-side
 * (`resolveTypeVariant`, `fontFor`).
 */
import { GUIDE_IDS } from '../src/derive';
import type { DeclaredToken } from '../src/resolve';
import type { Tokens } from '../src/types';

export type NativeLeafType =
  | 'color'
  | 'dimension'
  | 'duration'
  | 'number'
  | 'string'
  | 'cpFormula'
  | 'cubicBezier'
  | 'shadow'
  | 'typography';

export interface FlatLeaf {
  readonly path: readonly string[];
  readonly type: NativeLeafType;
  readonly value: unknown;
}

export interface TypographyLeafValue {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSize: number;
  readonly lineHeight: number;
}

const NATIVE_CATEGORIES = new Set([
  'color',
  'semantic',
  'guide',
  'tier',
  'member',
  'space',
  'size',
  'radius',
  'ring',
  'shadow',
  'type',
]);
const PASSTHROUGH_TYPES = new Set([
  'color',
  'dimension',
  'duration',
  'number',
  'string',
  'cpFormula',
  'cubicBezier',
  'shadow',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `type.*` tokens keep only fields a native Font helper or CSS declaration can use as-is. */
function simplifyTypography(value: unknown): TypographyLeafValue | undefined {
  if (!isRecord(value)) return undefined;
  const { fontFamily, fontWeight, lineHeight } = value;
  const fontSize = value['fontSize'] ?? value['fontSizeMax'];
  if (typeof fontFamily !== 'string' || typeof fontWeight !== 'number') return undefined;
  if (typeof fontSize !== 'number' || typeof lineHeight !== 'number') return undefined;
  return { fontFamily, fontWeight, fontSize, lineHeight };
}

function isPassthroughType(type: string): type is Exclude<NativeLeafType, 'typography'> {
  return PASSTHROUGH_TYPES.has(type);
}

/** `motion` only contributes its `duration` and `easing` groups; springs/transitions/gestures don't. */
function isNativeRelevantPath(path: readonly string[]): boolean {
  const category = path[0];
  if (category === undefined) return false;
  if (NATIVE_CATEGORIES.has(category)) return true;
  if (category === 'motion') return path[1] === 'duration' || path[1] === 'easing';
  return false;
}

/** Colour/dimension/etc. leaves plus a simplified `type.*` view and the computed guide onPaper colours. */
export function flattenForNative(
  tokens: Tokens,
  declarations: readonly DeclaredToken[],
): readonly FlatLeaf[] {
  const leaves: FlatLeaf[] = [];
  for (const decl of declarations) {
    const path = decl.path.split('.');
    if (!isNativeRelevantPath(path)) continue;
    if (decl.type === 'typography') {
      const simplified = simplifyTypography(decl.value);
      if (simplified !== undefined) leaves.push({ path, type: 'typography', value: simplified });
      continue;
    }
    if (isPassthroughType(decl.type)) leaves.push({ path, type: decl.type, value: decl.value });
  }
  for (const id of GUIDE_IDS) {
    leaves.push({ path: ['guide', 'onPaper', id], type: 'color', value: tokens.guide.onPaper[id] });
  }
  return leaves;
}

/** `cardBig` -> `card-big`; used for CSS custom property names. */
export function pathToKebab(path: readonly string[]): string {
  return path
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-');
}

/** `['card', 'Big']` -> `CardBig`; used for Swift/Kotlin member names. */
export function pathToPascal(path: readonly string[]): string {
  return path.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join('');
}

/**
 * `['card', 'big']` -> `cardBig`; used for Swift/Kotlin member names that must start lowercase.
 * A leading digit (the `space` scale is keyed by its own pt value, e.g. `space.8`) is not a valid
 * Swift/Kotlin identifier start, so it gets a `_` prefix instead (`_8`).
 */
export function pathToCamel(path: readonly string[]): string {
  const pascal = pathToPascal(path);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^[0-9]/.test(camel) ? `_${camel}` : camel;
}
