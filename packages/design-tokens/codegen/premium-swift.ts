/** Emits `CPPremium`: the premium tokens as SwiftUI values for the widgets and extensions. */
import type { Premium, PremiumFontWeight, PremiumShadow, PremiumTypeStyle } from '../src/premium';
import { GENERATED_HEADER } from './generated-header';
import type { PremiumLeaf } from './premium-leaves';
import { premiumLeaves, premiumModeLeaves } from './premium-leaves';

const PRELUDE = `import SwiftUI

/// Parses a hex (#rrggbb) or rgb()/rgba() premium token literal.
fileprivate func cpPremiumColor(_ value: String) -> Color {
    if value.hasPrefix("#") {
        var intValue: UInt64 = 0
        Scanner(string: String(value.dropFirst())).scanHexInt64(&intValue)
        return Color(
            .sRGB,
            red: Double((intValue >> 16) & 0xFF) / 255,
            green: Double((intValue >> 8) & 0xFF) / 255,
            blue: Double(intValue & 0xFF) / 255,
            opacity: 1
        )
    }
    let inner = value
        .replacingOccurrences(of: "rgba(", with: "")
        .replacingOccurrences(of: "rgb(", with: "")
        .replacingOccurrences(of: ")", with: "")
    let parts = inner.split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 0 }
    return Color(
        .sRGB,
        red: (parts.count > 0 ? parts[0] : 0) / 255,
        green: (parts.count > 1 ? parts[1] : 0) / 255,
        blue: (parts.count > 2 ? parts[2] : 0) / 255,
        opacity: parts.count > 3 ? parts[3] : 1
    )
}

public struct CPPremiumShadowLayer {
    public let x: CGFloat
    public let y: CGFloat
    public let blur: CGFloat
    public let spread: CGFloat
    public let color: Color
    public let inset: Bool
}

public struct CPPremiumType {
    public enum Family { case system, guide, mono }
    public let family: Family
    public let size: CGFloat
    public let weight: Font.Weight
    /// Letter spacing in pt.
    public let tracking: CGFloat
    /// Dynamic Type cap (multiplier of the base size).
    public let maxScale: CGFloat

    public var font: Font {
        switch family {
        case .system: return .system(size: size, weight: weight)
        case .guide: return .custom("Borel-400", size: size)
        case .mono: return .system(size: size, weight: weight, design: .monospaced)
        }
    }
}

public struct CPPremiumSpring {
    public let response: Double
    public let dampingFraction: Double
    public let bounce: Double

    public var animation: Animation { .spring(response: response, dampingFraction: dampingFraction) }
}
`;

const SWIFT_WEIGHT: Record<PremiumFontWeight, string> = {
  '400': '.regular',
  '500': '.medium',
  '600': '.semibold',
  '700': '.bold',
  '800': '.heavy',
};

const str = (value: string) => JSON.stringify(value);

function swiftShadow(shadow: PremiumShadow): string {
  const layers = shadow.map(
    (l) =>
      `CPPremiumShadowLayer(x: ${l.x}, y: ${l.y}, blur: ${l.blur}, spread: ${l.spread}, color: cpPremiumColor(${str(l.color)}), inset: ${l.inset === true})`,
  );
  return `[${layers.join(', ')}]`;
}

function swiftValue(leaf: PremiumLeaf): string {
  switch (leaf.kind) {
    case 'color':
      return `cpPremiumColor(${str(leaf.value)})`;
    case 'number':
      return String(leaf.value);
    case 'shadow':
      return swiftShadow(leaf.value);
  }
}

function swiftFieldType(leaf: PremiumLeaf): string {
  switch (leaf.kind) {
    case 'color':
      return 'Color';
    case 'number':
      return 'CGFloat';
    case 'shadow':
      return '[CPPremiumShadowLayer]';
  }
}

function constants(leaves: readonly PremiumLeaf[]): string {
  return leaves
    .map(
      (leaf) =>
        `        public static let ${leaf.name}: ${swiftFieldType(leaf)} = ${swiftValue(leaf)}`,
    )
    .join('\n');
}

function typeStyle(name: string, t: PremiumTypeStyle): string {
  return `        public static let ${name} = CPPremiumType(family: .${t.family}, size: ${t.size}, weight: ${SWIFT_WEIGHT[t.weight]}, tracking: ${t.tracking}, maxScale: ${t.maxScale})`;
}

export function emitPremiumSwift(premium: Premium): string {
  const { light, dark } = premiumModeLeaves(premium);
  const fields = light
    .map((leaf) => `    public let ${leaf.name}: ${swiftFieldType(leaf)}`)
    .join('\n');
  const instance = (leaves: readonly PremiumLeaf[]) =>
    `CPPremiumMode(\n${leaves.map((l) => `        ${l.name}: ${swiftValue(l)}`).join(',\n')}\n    )`;

  const springs = Object.entries(premium.spring)
    .map(
      ([name, s]) =>
        `        public static let ${name} = CPPremiumSpring(response: ${s.response}, dampingFraction: ${s.dampingFraction}, bounce: ${s.bounce})`,
    )
    .join('\n');

  return `${GENERATED_HEADER}
${PRELUDE}
/// One mode of the premium palette, elevation and materials.
public struct CPPremiumMode {
${fields}
}

public enum CPPremium {
    public static let light = ${instance(light)}

    public static let dark = ${instance(dark)}

    public static func mode(for scheme: ColorScheme) -> CPPremiumMode {
        scheme == .dark ? dark : light
    }

    public enum Accent {
${constants(premiumLeaves(premium.accent))}
    }

    public enum Stamp {
${constants(premiumLeaves(premium.stamp))}
    }

    public enum Signal {
${constants(premiumLeaves(premium.signal))}
    }

    public enum Typography {
${Object.entries(premium.type)
  .map(([name, t]) => typeStyle(name, t))
  .join('\n')}
    }

    public enum Radius {
${constants(premiumLeaves(premium.radius))}
    }

    public enum Space {
${constants(premiumLeaves(premium.space))}
    }

    public enum Size {
${constants(premiumLeaves(premium.size))}
    }

    public enum Spring {
${springs}
        public static let reduceMotionFade: Double = ${premium.motion.reduceMotionFadeMs / 1000}
    }
}
`;
}
