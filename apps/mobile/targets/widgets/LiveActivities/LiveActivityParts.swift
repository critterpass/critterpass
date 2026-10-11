import SwiftUI

/// A tier tag beside an eyebrow: BOOST and PASS+ on the perks, FREE where a surface says so.
struct LAPill: View {
    enum Tier {
        case free, boost, passPlus
    }

    let tier: Tier

    var body: some View {
        Text(label)
            .font(.system(size: 9.5, weight: .heavy))
            .foregroundStyle(tier == .free ? LAPalette.secondary : LAPalette.night)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(fill, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .lineLimit(1)
            .fixedSize()
    }

    private var label: LocalizedStringResource {
        switch tier {
        case .free: return "FREE"
        case .boost: return "BOOST"
        case .passPlus: return "PASS+"
        }
    }

    private var fill: Color {
        switch tier {
        case .free: return LAPalette.chip
        case .boost: return LAPalette.pink
        case .passPlus: return LAPalette.yellow
        }
    }
}

/// The colours a member's `tone` slot picks (the crew line, straggler rows): the crew colours.
enum LATone {
    static let lilac = Color(red: 0xB9 / 255, green: 0xA7 / 255, blue: 0xFF / 255)

    static func colour(_ tone: Int) -> Color {
        let colours = [
            LAPalette.yellow, LAPalette.pink, LAPalette.blue, LAPalette.green,
            LAPalette.orange, LAPalette.neutral, LAPalette.red, lilac,
        ]
        return colours[((tone % colours.count) + colours.count) % colours.count]
    }

    /// A crew colour by its name in payloads (`yellow`, `orange`, `blue`, `pink`, `green`, `cream`).
    static func named(_ name: String?) -> Color? {
        switch name {
        case "yellow": return LAPalette.yellow
        case "orange": return LAPalette.orange
        case "blue": return LAPalette.blue
        case "pink": return LAPalette.pink
        case "green": return LAPalette.green
        case "cream": return LAPalette.neutral
        default: return nil
        }
    }
}

/// A member as their initial on their crew colour, with a white edge so overlaps read.
struct LAMemberDot: View {
    let initial: String
    let tone: Int
    let size: CGFloat
    /// The edge: white on light grounds, the island's black there.
    var ring: Color = .white

    var body: some View {
        Text(initial)
            .font(.system(size: size * 0.45, weight: .bold))
            .foregroundStyle(LAPalette.night)
            .frame(width: size, height: size)
            .background(LATone.colour(tone), in: Circle())
            .overlay(Circle().strokeBorder(ring, lineWidth: 2))
            .shadow(color: .black.opacity(0.2), radius: 2, y: 1)
    }
}

/// The label of an activity's button: a capsule, loud (filled) or quiet (control fill).
struct LAButtonLabel: View {
    let text: LocalizedStringResource
    var fill: Color = LAPalette.chip
    var ink: Color = LAPalette.paper
    var stretch = true
    var weight: Font.Weight = .semibold
    var height: CGFloat = 40

    var body: some View {
        Text(text)
            .font(.system(size: 14, weight: weight))
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 14)
            .frame(maxWidth: stretch ? .infinity : nil, minHeight: height)
            .background(fill, in: Capsule())
    }
}

/// An eyebrow line: small bold capitals.
struct LAEyebrow: View {
    let text: Text
    let tint: Color

    var body: some View {
        text
            .font(.laEyebrow)
            .tracking(0.44)
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}
