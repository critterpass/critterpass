import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

/// The critter-nearby Live Activity (lock screen 6.30: system glass): something is hiding at this
/// place, and it counts the stay with the phone locked. The lock screen shows the silhouette on a
/// mint tile, the place, the time left to the second and a bar that fills in ten steps while the
/// member stays close; the island keeps the dwell ring. Wandering off drains it slowly. The state
/// says how close in a band and how long is left, never where.
struct CritterNearbyLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CritterNearbyActivityAttributes.self) { context in
            CritterNearbyLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    CritterDwellRing(attributes: context.attributes, state: state, size: 48)
                        .padding(.leading, 4)
                        .islandAppearance()
                }
                DynamicIslandExpandedRegion(.center) {
                    CritterNearbyHeadline(attributes: context.attributes, state: state, size: 17)
                        .foregroundStyle(LAIsland.text)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CritterNearbyTimeLeft(state: state, size: 20, ink: LAPalette.green)
                        .padding(.trailing, 4)
                        .islandAppearance()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    CritterNearbyAdvice(attributes: context.attributes, state: state)
                        .padding(.horizontal, 10)
                        .islandAppearance()
                }
            } compactLeading: {
                CritterDwellRing(attributes: context.attributes, state: state, size: 22)
                    .islandAppearance()
            } compactTrailing: {
                if state.state == .dwelling, state.endsAt != nil || state.remainMin != nil {
                    CritterNearbyTimeLeft(state: state, size: 13, ink: LAPalette.green, compact: true)
                } else {
                    Image(systemName: state.state == .caught ? "checkmark" : "pawprint.fill")
                        .foregroundStyle(LAPalette.green)
                }
            } minimal: {
                CritterDwellRing(attributes: context.attributes, state: state, size: 20)
                    .islandAppearance()
            }
            .keylineTint(LAPalette.green)
        }
    }
}

enum CritterNearbyPalette {
    /// The locked silhouette on the mint tile (6.30; between the tile and mint, no token).
    static let silhouette = Color(red: 0xB9 / 255, green: 0xE6 / 255, blue: 0xD2 / 255)
}

struct CritterNearbyLockScreen: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                CritterNearbyTile(attributes: attributes, state: state)
                VStack(alignment: .leading, spacing: 2) {
                    Text(eyebrow)
                        .font(.laEyebrow)
                        .tracking(0.66)
                        .foregroundStyle(LAPalette.successText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    CritterNearbyHeadline(attributes: attributes, state: state, size: 18)
                        .foregroundStyle(LAPalette.paper)
                    CritterNearbyAdvice(attributes: attributes, state: state)
                }
                Spacer(minLength: 6)
                CritterNearbyTimeLeft(state: state, size: 26, ink: LAPalette.paper)
            }
            if state.state == .dwelling || state.state == .draining {
                CritterNearbyBar(state: state)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    private var eyebrow: LocalizedStringResource {
        switch state.state {
        case .caught: return "FOUND"
        case .expired: return "GONE FOR NOW"
        case .dwelling, .draining: return "SOMETHING'S NEARBY"
        }
    }
}

/// The place as the headline while it hides there, or what happened once it is over.
struct CritterNearbyHeadline: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        Text(line)
            .font(.system(size: size, weight: .bold))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .contentTransition(.numericText())
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .caught: return "You found it"
        case .expired: return "It slipped away"
        case .draining: return "Come back"
        case .dwelling:
            if let place = attributes.placeName { return "\(place)" }
            return state.ring >= CritterRing.steps ? "It's right here" : "Stay close"
        }
    }
}

struct CritterNearbyAdvice: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        Text(line)
            .font(.system(size: 12))
            .foregroundStyle(LAPalette.muted)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .caught: return "Open CritterPass to meet it."
        case .expired: return "It wandered off. It will be back another time."
        case .draining: return "You wandered off. It drains slowly, so there is still time."
        case .dwelling:
            if state.ring >= CritterRing.steps {
                return "Open CritterPass and hold still to befriend it."
            }
            return "Stay within 50 m. Phone in your pocket is fine."
        }
    }
}

/// "4:00 min left": counted to the second from `ends_at`, else the whole minutes left.
struct CritterNearbyTimeLeft: View {
    let state: CritterNearbyActivityAttributes.ContentState
    let size: CGFloat
    let ink: Color
    var compact = false

    var body: some View {
        if state.state == .dwelling {
            VStack(alignment: .trailing, spacing: 0) {
                Group {
                    if let endsAt = state.endsAt, endsAt.laDate > .now {
                        Text(timerInterval: Date.now...endsAt.laDate, countsDown: true)
                            .multilineTextAlignment(.trailing)
                    } else if let minutes = state.remainMin {
                        Text(verbatim: "\(minutes):00")
                    }
                }
                .font(.system(size: size, weight: .heavy).monospacedDigit())
                .foregroundStyle(ink)
                .lineLimit(1)
                .frame(maxWidth: compact ? 44 : size * 3, alignment: .trailing)
                if !compact {
                    Text("min left")
                        .font(.system(size: 10.5, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                }
            }
        }
    }
}

/// The dwell as a bar: ten steps, mint while it fills, orange while it drains.
struct CritterNearbyBar: View {
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(LAPalette.track)
                Capsule()
                    .fill(state.state == .draining ? LAPalette.orange : LAPalette.green)
                    .frame(width: max(6, geo.size.width * CritterRing.fraction(ring: state.ring)))
            }
        }
        .frame(height: 6)
        .accessibilityHidden(true)
    }
}

/// The lock screen's tile: the silhouette (sharpening as the ring fills) on mint with a "?",
/// or the critter itself once found.
struct CritterNearbyTile: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        ZStack {
            CritterNearbyArt(attributes: attributes, state: state)
                .foregroundStyle(CritterNearbyPalette.silhouette)
                .padding(8)
                .blur(radius: CritterRing.blurRadius(stage: state.blurStage, size: 48))
            if state.state != .caught {
                Text(verbatim: "?")
                    .font(.system(size: 20, weight: .heavy))
                    .foregroundStyle(LAPalette.greenDeep)
            }
        }
        .frame(width: 64, height: 64)
        .background(LAPalette.successBg, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityHidden(true)
    }
}

/// The critter's art from the App Group once the app has put it there, else a paw print.
struct CritterNearbyArt: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        art.resizable().scaledToFit()
    }

    private var art: Image {
        if state.state == .caught, let found = state.foundKey, let image = LAAppGroupArt.critter(found) {
            return image
        }
        return LAAppGroupArt.critter(attributes.silhouetteKey)?.renderingMode(.template)
            ?? Image(systemName: "pawprint.fill")
    }
}

/// The dwell ring around the silhouette: filled by ring step, the silhouette blurred by stage,
/// a question mark until it is found.
struct CritterDwellRing: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        let line = max(2, size * 0.09)
        ZStack {
            Circle()
                .fill(LAPalette.successBg)
            Circle()
                .strokeBorder(LAPalette.track, lineWidth: line)
            Circle()
                .inset(by: line / 2)
                .trim(from: 0, to: CritterRing.fraction(ring: state.ring))
                .stroke(
                    state.state == .draining ? LAPalette.orange : LAPalette.green,
                    style: StrokeStyle(lineWidth: line, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            CritterNearbyArt(attributes: attributes, state: state)
                .foregroundStyle(CritterNearbyPalette.silhouette)
                .padding(size * 0.26)
                .blur(radius: CritterRing.blurRadius(stage: state.blurStage, size: size * 0.48))
            if state.state != .caught && size >= 40 {
                Text(verbatim: "?")
                    .font(.system(size: size * 0.26, weight: .heavy))
                    .foregroundStyle(LAPalette.greenDeep)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Art the app wrote into the App Group for its extensions (`assets/critters/<key>.png`).
enum LAAppGroupArt {
    static func critter(_ key: String) -> Image? {
        guard key.range(of: "^[A-Za-z0-9_-]{1,80}$", options: .regularExpression) != nil,
              let url = AppGroupContainer.url?.appendingPathComponent("assets/critters/\(key).png"),
              let image = UIImage(contentsOfFile: url.path)
        else { return nil }
        return Image(uiImage: image)
    }
}
