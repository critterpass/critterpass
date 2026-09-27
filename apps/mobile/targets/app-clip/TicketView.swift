import StoreKit
import SwiftUI

/// Colours from packages/design-tokens (color.tokens.json): the clip ships without the app's
/// token pipeline, so the handful it uses are mirrored here.
private enum ClipColor {
    static let background = Color(red: 0x17 / 255, green: 0x14 / 255, blue: 0x2A / 255)  // ink.850
    static let card = Color(red: 0x1F / 255, green: 0x1B / 255, blue: 0x38 / 255)  // ink.800
    static let yellow = Color(red: 0xFF / 255, green: 0xD8 / 255, blue: 0x4A / 255)  // yellow
    static let ink = Color(red: 0x17 / 255, green: 0x14 / 255, blue: 0x2A / 255)  // text on accents
    static let paper = Color(red: 0xF4 / 255, green: 0xEF / 255, blue: 0xE4 / 255)  // paper.base
    static let muted = Color(red: 0xA9 / 255, green: 0xA3 / 255, blue: 0xC0 / 255)  // ink.200
}

struct TicketScreen: View {
    @Bindable var model: ClipModel

    var body: some View {
        ZStack {
            ClipColor.background.ignoresSafeArea()
            content
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
        }
        .preferredColorScheme(.dark)
        .appStoreOverlay(isPresented: $model.showsInstallOverlay) {
            SKOverlay.AppClipConfiguration(position: .bottom)
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .waiting, .loading:
            VStack(spacing: 16) {
                GuideBadge()
                ProgressView().tint(ClipColor.yellow)
                Text(NSLocalizedString(
                    "clip.loading", value: "Finding your crew…", comment: "Clip loading line"))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ClipColor.muted)
            }
        case .ticket(_, let ticket):
            TicketLayout(ticket: ticket) { model.showsInstallOverlay = true }
        case .generic:
            GenericCard { model.showsInstallOverlay = true }
        }
    }
}

private struct TicketLayout: View {
    let ticket: TicketContent
    let getApp: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .top) {
                Text(ticket.headline.uppercased())
                    .font(.system(size: 40, weight: .black).width(.condensed))
                    .foregroundStyle(ClipColor.paper)
                    .lineLimit(3)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 8)
                GuideBadge()
            }
            TicketCard(ticket: ticket)
                .rotationEffect(.degrees(-1.5))
            Spacer(minLength: 0)
            if !ticket.isOpen {
                Text(NSLocalizedString(
                    "clip.closed", value: "This invite isn’t open any more. Ask for a new link.",
                    comment: "Expired, revoked or full invite"))
                    .font(.subheadline)
                    .foregroundStyle(ClipColor.muted)
            }
            PrimaryButton(
                title: NSLocalizedString(
                    "clip.take_seat", value: "Take the seat", comment: "Install the full app"),
                action: getApp)
            Text(String(
                format: NSLocalizedString(
                    "clip.code_hint", value: "Your code is %@ if you need it", comment: "Join code"),
                ticket.code))
                .font(.footnote.monospaced())
                .foregroundStyle(ClipColor.muted)
                .frame(maxWidth: .infinity)
        }
    }
}

private struct TicketCard: View {
    let ticket: TicketContent

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("CRITTERPASS AIR · CREW TICKET")
                Spacer()
                Text(ticket.code)
            }
            .font(.caption2.monospaced().weight(.semibold))
            HStack(alignment: .center, spacing: 8) {
                Text("YOU").font(.system(size: 36, weight: .black).width(.condensed))
                Rectangle()
                    .stroke(style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
                    .frame(height: 1)
                    .overlay(Image(systemName: "paperplane.fill").font(.headline))
                Text(ticket.destination)
                    .font(.system(size: 36, weight: .black).width(.condensed))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            Text(ticket.crewName.uppercased())
                .font(.headline.weight(.heavy))
            if let seats = ticket.seatsLine {
                Text(seats).font(.subheadline.weight(.semibold))
            }
        }
        .foregroundStyle(ClipColor.ink)
        .padding(18)
        .background(ClipColor.yellow, in: RoundedRectangle(cornerRadius: 22))
        .accessibilityElement(children: .combine)
    }
}

private struct GenericCard: View {
    let getApp: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            GuideBadge()
            Text("CRITTERPASS")
                .font(.system(size: 44, weight: .black).width(.condensed))
                .foregroundStyle(ClipColor.paper)
            Text(NSLocalizedString(
                "clip.generic.body",
                value: "Your pass to every place, and the locals who live there.",
                comment: "Generic clip card"))
                .multilineTextAlignment(.center)
                .foregroundStyle(ClipColor.muted)
            Spacer()
            PrimaryButton(
                title: NSLocalizedString(
                    "clip.get_app", value: "Get CritterPass", comment: "Install the full app"),
                action: getApp)
        }
    }
}

private struct GuideBadge: View {
    var body: some View {
        Image("Guide")
            .resizable()
            .scaledToFit()
            .frame(width: 72, height: 72)
            .padding(8)
            .background(ClipColor.card, in: Circle())
            .accessibilityHidden(true)
    }
}

private struct PrimaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(.headline.weight(.black))
                .tracking(1.5)
                .foregroundStyle(ClipColor.ink)
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(ClipColor.yellow, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}
