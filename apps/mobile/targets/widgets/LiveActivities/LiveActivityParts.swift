import SwiftUI

/// A tier pill beside an eyebrow: FREE on the free activities, BOOST and PASS+ on the perks.
struct LAPill: View {
    enum Tier {
        case free, boost, passPlus
    }

    let tier: Tier

    var body: some View {
        Text(label)
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.8)
            .foregroundStyle(tier == .free ? LAPalette.paper : LAPalette.night)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(fill, in: Capsule())
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

/// The eight avatar colours a member's `tone` picks (the crew line, straggler rows).
enum LATone {
    static let lilac = Color(red: 0xB9 / 255, green: 0xA7 / 255, blue: 0xFF / 255)

    static func colour(_ tone: Int) -> Color {
        let colours = [
            LAPalette.yellow, LAPalette.pink, LAPalette.blue, LAPalette.green,
            LAPalette.orange, LAPalette.paper, LAPalette.red, lilac,
        ]
        return colours[((tone % colours.count) + colours.count) % colours.count]
    }
}

/// A member as a coloured dot with their initial.
struct LAMemberDot: View {
    let initial: String
    let tone: Int
    let size: CGFloat

    var body: some View {
        Text(initial)
            .font(.system(size: size * 0.45, weight: .heavy))
            .foregroundStyle(LAPalette.night)
            .frame(width: size, height: size)
            .background(LATone.colour(tone), in: Circle())
            .overlay(Circle().strokeBorder(LAPalette.card, lineWidth: 1.5))
    }
}

/// The label of an activity's button: a capsule, loud (filled) or quiet (chip).
struct LAButtonLabel: View {
    let text: LocalizedStringResource
    var fill: Color = LAPalette.chip
    var ink: Color = LAPalette.paper
    var stretch = true

    var body: some View {
        Text(text)
            .font(.system(size: 12, weight: .heavy))
            .tracking(0.8)
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 12)
            .frame(maxWidth: stretch ? .infinity : nil, minHeight: 30)
            .background(fill, in: Capsule())
    }
}

/// A two-colour eyebrow line: small, heavy, tracked capitals.
struct LAEyebrow: View {
    let text: Text
    let tint: Color

    var body: some View {
        text
            .font(.laEyebrow)
            .tracking(1.2)
            .foregroundStyle(tint)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}
