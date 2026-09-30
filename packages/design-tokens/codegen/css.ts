/** Emits CSS custom properties on `:root` for `apps/web` from the flattened native-relevant leaves. */
import type { FlatLeaf, TypographyLeafValue } from './flatten';
import { pathToKebab } from './flatten';
import { GENERATED_HEADER_CSS } from './generated-header';

const FONT_FAMILY_CSS_NAME: Record<string, string> = {
  archivo: 'Archivo',
  geist: 'Geist',
  geistMono: 'Geist Mono',
  voice: 'Borel',
};

function cssFontFamily(logicalName: string): string {
  return FONT_FAMILY_CSS_NAME[logicalName] ?? logicalName;
}

function isTypographyValue(value: unknown): value is TypographyLeafValue {
  return typeof value === 'object' && value !== null && 'fontFamily' in value;
}

function isShadowValue(
  value: unknown,
): value is { offsetX: number; offsetY: number; blur: number; spread: number; color: string } {
  return typeof value === 'object' && value !== null && 'offsetX' in value;
}

function isCubicBezier(value: unknown): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4;
}

/** One leaf can expand into several `--name-suffix` declarations (typography does). */
function declarationsFor(leaf: FlatLeaf): readonly string[] {
  const name = pathToKebab(leaf.path);
  switch (leaf.type) {
    case 'color':
    case 'string':
      return [`--${name}: ${String(leaf.value)};`];
    case 'dimension':
      return [`--${name}: ${String(leaf.value)}px;`];
    case 'duration':
      return [`--${name}: ${String(leaf.value)}ms;`];
    case 'number':
      return [`--${name}: ${String(leaf.value)};`];
    case 'cpFormula':
      return []; // computed from an element's own box at render time; no fixed CSS value
    case 'cubicBezier':
      return isCubicBezier(leaf.value)
        ? [`--${name}: cubic-bezier(${leaf.value.join(', ')});`]
        : [];
    case 'shadow':
      if (!isShadowValue(leaf.value)) return [];
      return [
        `--${name}: ${leaf.value.offsetX}px ${leaf.value.offsetY}px ${leaf.value.blur}px ${leaf.value.spread}px ${leaf.value.color};`,
      ];
    case 'typography': {
      if (!isTypographyValue(leaf.value)) return [];
      const { fontFamily, fontWeight, fontSize, lineHeight } = leaf.value;
      return [
        `--${name}-font-family: ${cssFontFamily(fontFamily)};`,
        `--${name}-font-weight: ${fontWeight};`,
        `--${name}-font-size: ${fontSize}px;`,
        `--${name}-line-height: ${lineHeight};`,
      ];
    }
    default:
      return [];
  }
}

export function emitCss(leaves: readonly FlatLeaf[]): string {
  const lines = leaves.flatMap(declarationsFor).sort();
  const body = lines.map((line) => `  ${line}`).join('\n');
  return `${GENERATED_HEADER_CSS}\n:root {\n${body}\n}\n`;
}
