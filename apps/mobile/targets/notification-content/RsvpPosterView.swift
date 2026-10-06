import SwiftUI

/// The trip proposal poster: the question in big type on the guide's yellow, and the stamp once
/// the answer is in. OUT is never a button here: saying no asks a private reason in the app.
struct RsvpPosterView: View {
    let state: PosterState

    var body: some View {
        ZStack(alignment: .topLeading) {
            PosterPalette.yellow
            VStack(alignment: .leading, spacing: 6) {
                Text("TRIP PROPOSAL")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.2)
                    .foregroundStyle(PosterPalette.night.opacity(0.7))
                Text("ARE YOU IN?")
                    .font(.system(size: 40, weight: .black))
                    .foregroundStyle(PosterPalette.night)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if let title = state.content?.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(PosterPalette.night)
                        .lineLimit(2)
                }
            }
            .padding(18)
            PosterStampView(stamp: state.stamp, label: stampLabel)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                .padding(.bottom, 16)
        }
        .clipped()
    }

    private var stampLabel: String? {
        let word = { (status: String) in
            status == "in" ? String(localized: "I'M IN") : String(localized: "MAYBE")
        }
        switch state.stamp {
        case .none, .refused, .closed: return nil
        case .sending: return String(localized: "SENDING")
        case .queued(let status): return String(localized: "\(word(status)) · SENDS SOON")
        case .answered(let status): return word(status)
        }
    }
}
