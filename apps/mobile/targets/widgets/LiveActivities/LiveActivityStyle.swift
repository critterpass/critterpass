import SwiftUI
import UIKit

/// The premium palette the Live Activities and widgets draw with (targets/_shared/Tokens/
/// CPPremium.swift, generated from packages/design-tokens). The neutral roles follow the
/// appearance: ink text on light glass and white cards, light text on dark ones. The Dynamic Island
/// is always black, so its regions draw with `.islandAppearance()`. Crew and guide colours are the
/// same in both appearances.
enum LAPalette {
    /// Cards and widget grounds.
    static let card = adaptive(CPPremium.light.colorCard, CPPremium.dark.colorCard)
    /// Lanes, empty tracks and stop dots still ahead.
    static let track = adaptive(CPPremium.light.colorFieldBorder, CPPremium.dark.colorControl)
    /// Quiet buttons and chips.
    static let chip = adaptive(CPPremium.light.colorControl, CPPremium.dark.colorControl)
    /// Text and figures.
    static let paper = adaptive(CPPremium.light.colorInk, CPPremium.dark.colorInk)
    static let secondary = adaptive(CPPremium.light.colorInkSecondary, CPPremium.dark.colorInkSecondary)
    static let muted = adaptive(CPPremium.light.colorMuted, CPPremium.dark.colorMuted)
    static let hairline = adaptive(CPPremium.light.colorHairline, CPPremium.dark.colorHairline)
    /// Text on a crew colour (initials, labels on a sun button): dark in both appearances.
    static let night = CPPremium.light.colorOnAccent
    static let yellow = CPPremium.Accent.sun
    static let orange = CPPremium.Accent.tangerine
    static let pink = CPPremium.Accent.pink
    static let blue = CPPremium.Accent.sky
    static let green = CPPremium.Accent.mint
    static let neutral = CPPremium.Accent.neutral
    /// Chà Vá's guide colour (the one guide colour that is not a crew colour).
    static let red = Color(red: 0xFF / 255, green: 0x6B / 255, blue: 0x5B / 255)
    /// Status tints: booked and success, vote open, rain (light background, darker text).
    static let successBg = adaptive(CPPremium.light.colorStatusBookedBg, CPPremium.dark.colorStatusBookedBg)
    static let successText = adaptive(
        CPPremium.light.colorStatusBookedText, CPPremium.dark.colorStatusBookedText)
    static let destructiveBg = adaptive(
        CPPremium.light.colorDestructiveBg, CPPremium.dark.colorDestructiveBg)
    static let destructiveText = adaptive(
        CPPremium.light.colorDestructiveText, CPPremium.dark.colorDestructiveText)

    /// Tokek's own ground (avatars, the roundup's rows) and the tangerine tint (6.29 tiles).
    static let guideBg = adaptive(CPPremium.light.colorStatusMaybeBg, CPPremium.dark.colorStatusMaybeBg)
    static let tangerineBg = adaptive(
        CPPremium.light.colorStatusTangerineBg, CPPremium.dark.colorStatusTangerineBg)
    /// Deeper green for figures and marks on the success tint.
    static let greenDeep = CPPremium.Stamp.greenText

    private static func adaptive(_ light: Color, _ dark: Color) -> Color {
        let light = UIColor(light)
        let dark = UIColor(dark)
        return Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
}

/// The Dynamic Island's own colours on its black ground (6.27).
enum LAIsland {
    static let text = Color.white
    static let muted = Color.white.opacity(0.7)
    static let eyebrow = Color.white.opacity(0.6)
    static let chip = Color.white.opacity(0.18)
    static let track = Color.white.opacity(0.2)
    static let upcoming = Color(red: 0x55 / 255, green: 0x55 / 255, blue: 0x55 / 255)
}

extension View {
    /// The island is black in either appearance: resolve the adaptive palette as dark there.
    func islandAppearance() -> some View {
        environment(\.colorScheme, .dark)
    }
}

/// The trip's guide on a Live Activity: its colour and its critter's baked art, idle while the
/// crew sleeps and cheering once it is time to go. Each name below is embedded in this extension
/// by plugins/with-critter-art.ts; a guide without art here shows Tokek.
struct LAGuide {
    let tint: Color
    private let idle: String
    private let cheer: String

    init(slug: String) {
        switch slug {
        case "pon":
            (tint, idle, cheer) = (
                LAPalette.orange, "tanuki-common-idle-color-48pt", "tanuki-common-cheer-color-48pt"
            )
        case "lundi":
            (tint, idle, cheer) = (
                LAPalette.blue, "puffin-common-idle-color-48pt", "puffin-common-cheer-color-48pt"
            )
        case "ajo":
            (tint, idle, cheer) = (
                LAPalette.pink, "axolotl-common-idle-color-48pt", "axolotl-common-cheer-color-48pt"
            )
        case "sardi":
            (tint, idle, cheer) = (
                LAPalette.green, "sardine-common-idle-color-48pt", "sardine-common-cheer-color-48pt"
            )
        case "paco":
            (tint, idle, cheer) = (
                LAPalette.neutral, "alpaca-common-idle-color-48pt", "alpaca-common-cheer-color-48pt"
            )
        case "chava":
            (tint, idle, cheer) = (
                LAPalette.red, "langur-common-idle-color-48pt", "langur-common-cheer-color-48pt"
            )
        default:
            (tint, idle, cheer) = (LAPalette.yellow, Self.tokekIdle, Self.tokekCheer)
        }
    }

    private static let tokekIdle = "gecko-common-idle-color-48pt"
    private static let tokekCheer = "gecko-common-cheer-color-48pt"

    func art(cheer cheering: Bool) -> Image {
        Image(cheering ? cheer : idle)
    }

    /// The guide's name as the app writes it (the slug is its lower-case id).
    static func displayName(slug: String) -> String {
        slug.isEmpty ? "Tokek" : slug.prefix(1).uppercased() + slug.dropFirst()
    }
}

/// The guide's critter on its colour: a 34 pt rounded tile with the art filling it (6.27, 6.32).
struct LAGuideBadge: View {
    let guide: LAGuide
    var cheering = false
    var size: CGFloat = 34

    var body: some View {
        guide.art(cheer: cheering)
            .resizable()
            .scaledToFit()
            .padding(1)
            .frame(width: size, height: size)
            .background(guide.tint, in: RoundedRectangle(cornerRadius: size * 10 / 34, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// A horizontal line through the middle of its frame (stroke it dashed for a route or a trail).
struct LADashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return path
    }
}

extension Font {
    /// Eyebrows: small bold capitals ("LEAVE BY", "MEET-UP · 17:00").
    static let laEyebrow = Font.system(size: 11, weight: .bold)
    static let laLabel = Font.system(size: 10.5, weight: .semibold)
    /// Tokek's voice (Borel, bundled in this extension).
    static func laGuide(_ size: CGFloat) -> Font { .custom("Borel-400", size: size) }
}

extension Int {
    /// ContentState times are unix seconds (packages/domain la-common).
    var laDate: Date { Date(timeIntervalSince1970: TimeInterval(self)) }
}
