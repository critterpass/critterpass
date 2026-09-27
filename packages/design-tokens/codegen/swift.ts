/** Emits `CPTokens`: SwiftUI `Color`/`CGFloat`/`Font` values for the extension targets (Color, CGFloat, Font helpers). */
import { nativeCategoryDisplayName } from './category-names';
import type { FlatLeaf, TypographyLeafValue } from './flatten';
import { pathToCamel } from './flatten';
import { GENERATED_HEADER } from './generated-header';

const PRELUDE = `import SwiftUI

/// Parses either a hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or rgb()/rgba() token literal.
extension Color {
    init(cpToken value: String) {
        if value.hasPrefix("#") {
            var hex = String(value.dropFirst())
            if hex.count == 3 {
                hex = hex.map { "\\($0)\\($0)" }.joined()
            }
            var intValue: UInt64 = 0
            Scanner(string: hex).scanHexInt64(&intValue)
            let hasAlpha = hex.count > 6
            let r = Double((intValue >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
            let g = Double((intValue >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
            let b = Double((intValue >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
            let a = hasAlpha ? Double(intValue & 0xFF) / 255 : 1
            self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
        } else {
            let inner = value
                .replacingOccurrences(of: "rgba(", with: "")
                .replacingOccurrences(of: "rgb(", with: "")
                .replacingOccurrences(of: ")", with: "")
            let parts = inner.split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 0 }
            let r = (parts.count > 0 ? parts[0] : 0) / 255
            let g = (parts.count > 1 ? parts[1] : 0) / 255
            let b = (parts.count > 2 ? parts[2] : 0) / 255
            let a = parts.count > 3 ? parts[3] : 1
            self.init(.sRGB, red: r, green: g, blue: b, opacity: a)
        }
    }
}

public struct CPShadow {
    public let offsetX: CGFloat
    public let offsetY: CGFloat
    public let blur: CGFloat
    public let spread: CGFloat
    public let color: Color
}

public struct CPTypography {
    public let fontFamily: String
    public let fontWeight: Double
    public let fontSize: CGFloat
    public let lineHeight: CGFloat

    public var font: Font {
        .custom(fontFamily, size: fontSize)
    }
}
`;

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

function swiftString(value: string): string {
  return JSON.stringify(value);
}

/** One member declaration for the leaf's remaining path (category-relative), or `undefined` to skip it. */
function memberFor(leaf: FlatLeaf): string | undefined {
  const memberName = pathToCamel(leaf.path.slice(1));
  switch (leaf.type) {
    case 'color':
      return `        public static let ${memberName} = Color(cpToken: ${swiftString(String(leaf.value))})`;
    case 'dimension':
    case 'duration':
    case 'number':
      return `        public static let ${memberName}: CGFloat = ${String(leaf.value)}`;
    case 'string':
      return `        public static let ${memberName}: String = ${swiftString(String(leaf.value))}`;
    case 'cpFormula':
      return undefined; // computed from an element's own frame at render time
    case 'cubicBezier':
      if (!isCubicBezier(leaf.value)) return undefined;
      return `        public static let ${memberName}: (Double, Double, Double, Double) = (${leaf.value.join(', ')})`;
    case 'shadow':
      if (!isShadowValue(leaf.value)) return undefined;
      return `        public static let ${memberName} = CPShadow(offsetX: ${leaf.value.offsetX}, offsetY: ${leaf.value.offsetY}, blur: ${leaf.value.blur}, spread: ${leaf.value.spread}, color: Color(cpToken: ${swiftString(leaf.value.color)}))`;
    case 'typography':
      if (!isTypographyValue(leaf.value)) return undefined;
      return `        public static let ${memberName} = CPTypography(fontFamily: ${swiftString(leaf.value.fontFamily)}, fontWeight: ${leaf.value.fontWeight}, fontSize: ${leaf.value.fontSize}, lineHeight: ${leaf.value.lineHeight})`;
    default:
      return undefined;
  }
}

export function emitSwift(leaves: readonly FlatLeaf[]): string {
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
      return `    public enum ${nativeCategoryDisplayName(category)} {\n${members}\n    }`;
    })
    .join('\n\n');

  return `${GENERATED_HEADER}\n${PRELUDE}\npublic enum CPTokens {\n${sections}\n}\n`;
}
