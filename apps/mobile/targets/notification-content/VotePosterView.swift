import Observation
import SwiftUI
import UIKit

/// What the poster shows right now; the controller changes it in place as an answer goes out, so
/// the notification stays open (`.doNotDismiss`) and the stamp lands on the poster itself.
@MainActor
@Observable
final class PosterState {
    var content: PosterContent?
    var stamp: PosterStamp = .none
    /// Votes per option id once the server has answered.
    var tallies: [String: Int] = [:]
    var deliveredAt: Date?
}

enum PosterStamp: Equatable, Sendable {
    case none
    /// Tapped; the request is on its way.
    case sending(String)
    /// Offline: in the outbox, sent by the app on its next launch.
    case queued(String)
    /// Counted: the option voted for, or the RSVP status.
    case answered(String)
    case closed(winner: String?)
    /// Not taken here (the key was refused): OPEN still works.
    case refused
}

/// The premium colours the posters draw with (targets/_shared/Tokens/CPPremium.swift): ink text
/// on the notification's own material, adapting to dark mode; crew colours stay the same.
enum PosterPalette {
    static let ink = adaptive(CPPremium.light.colorInk, CPPremium.dark.colorInk)
    static let secondary = adaptive(CPPremium.light.colorInkSecondary, CPPremium.dark.colorInkSecondary)
    static let muted = adaptive(CPPremium.light.colorMuted, CPPremium.dark.colorMuted)
    static let card = adaptive(CPPremium.light.colorCard, CPPremium.dark.colorCard)
    static let hairline = adaptive(CPPremium.light.colorHairline, CPPremium.dark.colorHairline)
    static let paper = CPPremium.Accent.paper
    static let yellow = CPPremium.Accent.sun
    static let orange = CPPremium.Accent.tangerine
    static let blue = CPPremium.Accent.sky
    static let green = CPPremium.Accent.mint
    static let pink = CPPremium.Accent.pink
    static let cream = CPPremium.Accent.neutral
    /// Text on a crew colour: dark in both appearances.
    static let night = CPPremium.light.colorOnAccent
    /// Tokek's own ground.
    static let guideBg = CPPremium.light.colorStatusMaybeBg

    /// A crew colour by its payload name, sun when unknown.
    static func tone(_ name: String?) -> Color {
        switch name {
        case "orange": return orange
        case "blue": return blue
        case "pink": return pink
        case "green": return green
        case "cream": return cream
        default: return yellow
        }
    }

    /// The light tile behind an answer's critter (6.29: tangerine `#fff1e6`, mint `#e3f6ec`).
    static func tile(_ name: String?) -> Color {
        switch name {
        case "orange": return Color(red: 0xFF / 255, green: 0xF1 / 255, blue: 0xE6 / 255)
        case "green": return CPPremium.light.colorStatusBookedBg
        case "blue": return CPPremium.light.colorStatusRainBg
        case "pink": return CPPremium.light.colorStatusVoteOpenBg
        case "cream": return CPPremium.light.colorControl
        default: return CPPremium.light.colorStatusMaybeBg
        }
    }

    private static func adaptive(_ light: Color, _ dark: Color) -> Color {
        let light = UIColor(light)
        let dark = UIColor(dark)
        return Color(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
}

/// Each guide's critter as this extension embeds it (plugins/with-critter-art.ts lists the same
/// names); an unknown guide is Tokek.
enum PosterArt {
    static func idle(slug: String?) -> String {
        switch slug {
        case "pon": return "tanuki-common-idle-color-48pt"
        case "lundi": return "puffin-common-idle-color-48pt"
        case "ajo": return "axolotl-common-idle-color-48pt"
        case "sardi": return "sardine-common-idle-color-48pt"
        case "paco": return "alpaca-common-idle-color-48pt"
        case "chava": return "langur-common-idle-color-48pt"
        default: return "gecko-common-idle-color-48pt"
        }
    }
}

struct PosterRoot: View {
    let state: PosterState

    var body: some View {
        switch state.content?.kind {
        case .vote?: VotePosterView(state: state)
        case .rsvp?: RsvpPosterView(state: state)
        case .changeset(let change)?: ChangesetPosterView(state: state, change: change)
        case .roundup(let subtitle, let lines)?:
            RoundupPosterView(title: state.content?.title ?? "", subtitle: subtitle, lines: lines)
        case nil: Color.clear
        }
    }
}

/// The poster's header: a small badge, who it is from, and when.
struct PosterHeader: View {
    let title: String
    let art: String
    let tint: Color
    var size: CGFloat = 24
    var deliveredAt: Date?

    var body: some View {
        HStack(spacing: 8) {
            Image(art)
                .resizable()
                .scaledToFit()
                .padding(1)
                .frame(width: size, height: size)
                .background(tint, in: RoundedRectangle(cornerRadius: size * 7 / 24, style: .continuous))
                .accessibilityHidden(true)
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(PosterPalette.ink)
                .lineLimit(1)
            Spacer(minLength: 6)
            if let deliveredAt {
                Text(deliveredAt, format: .relative(presentation: .named))
                    .font(.system(size: 12))
                    .foregroundStyle(PosterPalette.muted)
                    .lineLimit(1)
            }
        }
    }
}

/// The vote poster (6.29): who is asking, the first two answers as tiles with their critters and
/// counts on stickers, "VS" between, and how many have voted with when it closes. The stamp lands
/// on the poster once the vote is in.
struct VotePosterView: View {
    let state: PosterState

    var body: some View {
        let content = state.content
        let options = Array((content?.options ?? []).prefix(2))
        VStack(alignment: .leading, spacing: 12) {
            PosterHeader(
                title: content?.title ?? "", art: PosterArt.idle(slug: nil), tint: PosterPalette.yellow,
                deliveredAt: state.deliveredAt)
            ZStack {
                HStack(spacing: 28) {
                    ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                        tile(option, tilt: index == 1)
                    }
                }
                if options.count > 1 {
                    Text(verbatim: "VS")
                        .font(.system(size: 14, weight: .heavy))
                        .foregroundStyle(PosterPalette.ink)
                }
                PosterStampView(stamp: state.stamp, label: stampLabel)
            }
            if let line = content?.turnoutLine() {
                Text(line)
                    .font(.system(size: 13))
                    .foregroundStyle(PosterPalette.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private func tile(_ option: PosterContent.Option, tilt: Bool) -> some View {
        let count = state.tallies[option.id] ?? option.count
        return ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(PosterPalette.tile(option.tone))
            Image(PosterArt.idle(slug: option.critter))
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
                .rotationEffect(.degrees(tilt ? -14 : 0))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .opacity(loser(option) ? 0.4 : 1)
                .accessibilityHidden(true)
            Text(count.map { "\(option.label) · \($0)" } ?? option.label)
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(PosterPalette.night)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(PosterPalette.tone(option.tone), in: RoundedRectangle(cornerRadius: 7))
                .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color.white, lineWidth: 2))
                .padding(8)
                .contentTransition(.numericText())
        }
        .frame(maxWidth: .infinity, minHeight: 100, maxHeight: 100)
    }

    private func loser(_ option: PosterContent.Option) -> Bool {
        if case .closed(let winner?) = state.stamp { return winner != option.id }
        return false
    }

    private var stampLabel: String? {
        let label = { (id: String) in state.content?.label(ofOption: id)?.uppercased() ?? "" }
        switch state.stamp {
        case .none, .refused: return nil
        case .sending: return String(localized: "SENDING")
        case .queued(let id): return String(localized: "\(label(id)) · SENDS SOON")
        case .answered(let id): return String(localized: "VOTED \(label(id))")
        case .closed(let winner): return winner.map { String(localized: "\(label($0)) WINS") }
            ?? String(localized: "VOTE CLOSED")
        }
    }
}

/// The rubber stamp across the poster: tilted, in the night ink, faded while still sending.
struct PosterStampView: View {
    let stamp: PosterStamp
    let label: String?

    var body: some View {
        if let label {
            Text(label)
                .font(.system(size: 18, weight: .heavy))
                .tracking(1.5)
                .foregroundStyle(CPPremium.Stamp.pinkText)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(PosterPalette.paper, in: RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6).strokeBorder(CPPremium.Stamp.pinkRing, lineWidth: 3)
                )
                .rotationEffect(.degrees(-8))
                .opacity(isSending ? 0.6 : 1)
                .padding(.horizontal, 24)
                .transition(.scale(scale: 1.6).combined(with: .opacity))
                // The Lively spring (foundations 1.07).
                .animation(CPPremium.Spring.lively.animation, value: label)
        }
    }

    private var isSending: Bool {
        if case .sending = stamp { return true }
        return false
    }
}
