/** Emits `CpTokens`: Compose/Glance `Color`/`Dp`/`TextUnit` values for the Android surfaces module. */
import { nativeCategoryDisplayName } from './category-names.js';
import type { FlatLeaf, TypographyLeafValue } from './flatten.js';
import { pathToCamel } from './flatten.js';
import { GENERATED_HEADER } from './generated-header.js';

const PACKAGE_NAME = 'app.critterpass.designtokens';

const PRELUDE = `package ${PACKAGE_NAME}

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Parses either a hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or rgb()/rgba() token literal. */
private fun cpColor(value: String): Color {
    if (value.startsWith("#")) {
        var hex = value.removePrefix("#")
        if (hex.length == 3) {
            hex = hex.map { "$it$it" }.joinToString("")
        }
        val hasAlpha = hex.length > 6
        val intValue = hex.toLong(16)
        val r = ((intValue shr (if (hasAlpha) 24 else 16)) and 0xFF) / 255f
        val g = ((intValue shr (if (hasAlpha) 16 else 8)) and 0xFF) / 255f
        val b = ((intValue shr (if (hasAlpha) 8 else 0)) and 0xFF) / 255f
        val a = if (hasAlpha) (intValue and 0xFF) / 255f else 1f
        return Color(red = r, green = g, blue = b, alpha = a)
    }
    val inner = value.removePrefix("rgba(").removePrefix("rgb(").removeSuffix(")")
    val parts = inner.split(",").map { it.trim().toFloatOrNull() ?: 0f }
    val r = (parts.getOrElse(0) { 0f }) / 255f
    val g = (parts.getOrElse(1) { 0f }) / 255f
    val b = (parts.getOrElse(2) { 0f }) / 255f
    val a = parts.getOrElse(3) { 1f }
    return Color(red = r, green = g, blue = b, alpha = a)
}

data class CpShadow(val offsetX: Dp, val offsetY: Dp, val blur: Dp, val spread: Dp, val color: Color)

data class CpTypography(val fontFamilyName: String, val fontWeight: FontWeight, val fontSize: TextUnit, val lineHeight: Float)
`;

function isTypographyValue(value: unknown): value is TypographyLeafValue {
  return typeof value === 'object' && value !== null && 'fontFamily' in value;
}

function isShadowValue(value: unknown): value is { offsetX: number; offsetY: number; blur: number; spread: number; color: string } {
  return typeof value === 'object' && value !== null && 'offsetX' in value;
}

function isCubicBezier(value: unknown): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4;
}

function kotlinString(value: string): string {
  return JSON.stringify(value);
}

/** One member declaration for the leaf's remaining path (category-relative), or `undefined` to skip it. */
function memberFor(leaf: FlatLeaf): string | undefined {
  const memberName = pathToCamel(leaf.path.slice(1));
  switch (leaf.type) {
    case 'color':
      return `    val ${memberName}: Color = cpColor(${kotlinString(String(leaf.value))})`;
    case 'dimension':
      return `    val ${memberName}: Dp = ${String(leaf.value)}.dp`;
    case 'duration':
      return `    val ${memberName}: Int = ${String(leaf.value)}`;
    case 'number':
      return `    val ${memberName}: Float = ${String(leaf.value)}f`;
    case 'string':
      return `    val ${memberName}: String = ${kotlinString(String(leaf.value))}`;
    case 'cpFormula':
      return undefined; // computed from an element's own bounds at render time
    case 'cubicBezier':
      if (!isCubicBezier(leaf.value)) return undefined;
      return `    val ${memberName} = CubicBezierEasing(${leaf.value.map((n) => `${n}f`).join(', ')})`;
    case 'shadow':
      if (!isShadowValue(leaf.value)) return undefined;
      return `    val ${memberName} = CpShadow(offsetX = ${leaf.value.offsetX}.dp, offsetY = ${leaf.value.offsetY}.dp, blur = ${leaf.value.blur}.dp, spread = ${leaf.value.spread}.dp, color = cpColor(${kotlinString(leaf.value.color)}))`;
    case 'typography':
      if (!isTypographyValue(leaf.value)) return undefined;
      return `    val ${memberName} = CpTypography(fontFamilyName = ${kotlinString(leaf.value.fontFamily)}, fontWeight = FontWeight(${leaf.value.fontWeight}), fontSize = ${leaf.value.fontSize}.sp, lineHeight = ${leaf.value.lineHeight}f)`;
    default:
      return undefined;
  }
}

export function emitKotlin(leaves: readonly FlatLeaf[]): string {
  const byCategory = new Map<string, FlatLeaf[]>();
  for (const leaf of leaves) {
    const category = leaf.path[0] ?? '';
    const bucket = byCategory.get(category);
    if (bucket) bucket.push(leaf);
    else byCategory.set(category, [leaf]);
  }

  const sections = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, categoryLeaves]) => {
      const members = categoryLeaves
        .map(memberFor)
        .filter((line): line is string => line !== undefined)
        .join('\n');
      return `    object ${nativeCategoryDisplayName(category)} {\n${members}\n    }`;
    })
    .join('\n\n');

  return `${GENERATED_HEADER}\n${PRELUDE}\nobject CpTokens {\n${sections}\n}\n`;
}
