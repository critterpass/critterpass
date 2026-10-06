import Observation
import SwiftUI

/// What the poster shows right now; the controller changes it in place as an answer goes out, so
/// the notification stays open (`.doNotDismiss`) and the stamp lands on the poster itself.
@MainActor
@Observable
final class PosterState {
    var content: PosterContent?
    var stamp: PosterStamp = .none
    /// Votes per option id once the server has answered.
    var tallies: [String: Int] = [:]
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

/// Design tokens the posters use (packages/design-tokens `color.*`).
enum PosterPalette {
    static let card = Color(red: 0x12 / 255, green: 0x0F / 255, blue: 0x22 / 255)
    static let paper = Color(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xE4 / 255)
    static let muted = Color(red: 0xA9 / 255, green: 0xA3 / 255, blue: 0xC0 / 255)
    static let yellow = Color(red: 0xFF / 255, green: 0xD8 / 255, blue: 0x4A / 255)
    static let orange = Color(red: 0xFF / 255, green: 0x9A / 255, blue: 0x4D / 255)
    static let blue = Color(red: 0x4F / 255, green: 0x86 / 255, blue: 0xFF / 255)
    static let green = Color(red: 0x54 / 255, green: 0xD6 / 255, blue: 0xA4 / 255)
    static let night = Color(red: 0x0D / 255, green: 0x0B / 255, blue: 0x18 / 255)
}

struct PosterRoot: View {
    let state: PosterState

    var body: some View {
        switch state.content?.kind {
        case .vote?: VotePosterView(state: state)
        case .rsvp?: RsvpPosterView(state: state)
        case nil: PosterPalette.card
        }
    }
}

/// The vote showdown (5b-2): the first two options face off on an orange and blue split with
/// their critters and a pulsing VS; the stamp lands on the poster once the vote is in.
struct VotePosterView: View {
    let state: PosterState
    @State private var pulse = false

    var body: some View {
        let options = state.content?.options ?? []
        ZStack {
            PosterPalette.blue
            PosterSlant().fill(PosterPalette.orange)
            if let left = options.first {
                side(left, art: "tanuki-common-idle-color-48pt", leading: true)
            }
            if options.count > 1 {
                side(options[1], art: "sardine-common-idle-color-48pt", leading: false)
            }
            Text("VS")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(PosterPalette.yellow)
                .frame(width: 58, height: 58)
                .background(PosterPalette.night, in: Circle())
                .scaleEffect(pulse ? 1.08 : 1)
                .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
                .onAppear { pulse = true }
            PosterStampView(stamp: state.stamp, label: stampLabel)
        }
        .clipped()
    }

    private func side(_ option: PosterContent.Option, art: String, leading: Bool) -> some View {
        VStack(alignment: leading ? .leading : .trailing, spacing: 6) {
            if leading { name(option) }
            Image(art)
                .resizable()
                .scaledToFit()
                .frame(width: 84, height: 84)
                .opacity(loser(option) ? 0.4 : 1)
                .accessibilityHidden(true)
            if !leading { name(option) }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: leading ? .topLeading : .bottomTrailing)
    }

    private func name(_ option: PosterContent.Option) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(option.label.uppercased())
                .font(.system(size: 34, weight: .black))
                .foregroundStyle(PosterPalette.night)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if let count = state.tallies[option.id] {
                Text("\(count) VOTES")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1)
                    .foregroundStyle(PosterPalette.night)
                    .contentTransition(.numericText())
            }
        }
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
                .font(.system(size: 18, weight: .black))
                .tracking(1.5)
                .foregroundStyle(PosterPalette.night)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(PosterPalette.paper, in: RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(PosterPalette.night, lineWidth: 3))
                .rotationEffect(.degrees(-8))
                .opacity(isSending ? 0.6 : 1)
                .padding(.horizontal, 24)
                .transition(.scale(scale: 1.6).combined(with: .opacity))
                .animation(.spring(duration: 0.4), value: label)
        }
    }

    private var isSending: Bool {
        if case .sending = stamp { return true }
        return false
    }
}

/// The left side of the split: top edge to 60 %, bottom edge to 40 %.
struct PosterSlant: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.6, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX + rect.width * 0.4, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
