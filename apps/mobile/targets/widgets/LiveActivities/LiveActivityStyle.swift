import SwiftUI

/// Design tokens the Live Activity views use (packages/design-tokens `color.*`, `guide.*`).
enum LAPalette {
    static let card = Color(red: 0x12 / 255, green: 0x0F / 255, blue: 0x22 / 255)  // ink.900
    static let track = Color(red: 0x3A / 255, green: 0x34 / 255, blue: 0x66 / 255)  // ink.600
    static let chip = Color(red: 0x2C / 255, green: 0x27 / 255, blue: 0x50 / 255)  // ink.700
    static let paper = Color(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xE4 / 255)  // paper.base
    static let muted = Color(red: 0xA9 / 255, green: 0xA3 / 255, blue: 0xC0 / 255)  // ink.200
    static let yellow = Color(red: 0xFF / 255, green: 0xD8 / 255, blue: 0x4A / 255)
    static let orange = Color(red: 0xFF / 255, green: 0x9A / 255, blue: 0x4D / 255)
    static let pink = Color(red: 0xFF / 255, green: 0x5F / 255, blue: 0xA8 / 255)
    static let red = Color(red: 0xFF / 255, green: 0x6B / 255, blue: 0x5B / 255)
    static let blue = Color(red: 0x4F / 255, green: 0x86 / 255, blue: 0xFF / 255)
    static let green = Color(red: 0x54 / 255, green: 0xD6 / 255, blue: 0xA4 / 255)
    static let night = Color(red: 0x0D / 255, green: 0x0B / 255, blue: 0x18 / 255)  // ink.930
}

/// The trip's guide on a Live Activity: its colour (C5) and its critter's baked art, idle while the
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
                LAPalette.paper, "alpaca-common-idle-color-48pt", "alpaca-common-cheer-color-48pt"
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
    /// Eyebrows: small, heavy, tracked capitals.
    static let laEyebrow = Font.system(size: 11, weight: .heavy)
    static let laLabel = Font.system(size: 10, weight: .bold)
}

extension Int {
    /// ContentState times are unix seconds (packages/domain la-common).
    var laDate: Date { Date(timeIntervalSince1970: TimeInterval(self)) }
}
