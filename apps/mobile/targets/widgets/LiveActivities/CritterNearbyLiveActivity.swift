import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

/// The critter-nearby Live Activity (5a-4): something is hiding at this place, and it counts the
/// stay with the phone locked. The ring fills in ten steps while the member stays close, the
/// silhouette sharpens as it fills, and wandering off drains it slowly. The state says how close
/// in a band and how long is left, never where.
struct CritterNearbyLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CritterNearbyActivityAttributes.self) { context in
            CritterNearbyLockScreen(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(CritterNearbyPalette.glade)
                .activitySystemActionForegroundColor(LAPalette.paper)
        } dynamicIsland: { context in
            let state = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    CritterDwellRing(attributes: context.attributes, state: state, size: 48)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    CritterNearbyHeadline(state: state, size: 17)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    CritterNearbyAdvice(attributes: context.attributes, state: state)
                        .padding(.horizontal, 10)
                }
            } compactLeading: {
                CritterDwellRing(attributes: context.attributes, state: state, size: 22)
            } compactTrailing: {
                if let minutes = state.remainMin, state.state == .dwelling {
                    Text("\(minutes) min")
                        .font(.system(size: 13, weight: .heavy).monospacedDigit())
                        .foregroundStyle(LAPalette.green)
                        .contentTransition(.numericText())
                } else {
                    Image(systemName: state.state == .caught ? "checkmark" : "pawprint.fill")
                        .foregroundStyle(LAPalette.green)
                }
            } minimal: {
                CritterDwellRing(attributes: context.attributes, state: state, size: 20)
            }
            .keylineTint(LAPalette.green)
        }
    }
}

enum CritterNearbyPalette {
    /// The night green the encounter scene sits on.
    static let glade = Color(red: 0x12 / 255, green: 0x26 / 255, blue: 0x20 / 255)
    static let well = Color(red: 0x1B / 255, green: 0x17 / 255, blue: 0x33 / 255)
}

struct CritterNearbyLockScreen: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                LAEyebrow(text: Text(eyebrow), tint: LAPalette.green)
                LAPill(tier: .free)
                Spacer(minLength: 6)
                if let place = attributes.placeName {
                    Text(place)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                        .lineLimit(1)
                }
            }
            HStack(spacing: 14) {
                CritterDwellRing(attributes: attributes, state: state, size: 84)
                VStack(alignment: .leading, spacing: 4) {
                    CritterNearbyHeadline(state: state, size: 24)
                    CritterNearbyAdvice(attributes: attributes, state: state)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var eyebrow: LocalizedStringResource {
        switch state.state {
        case .caught: return "FOUND"
        case .expired: return "GONE FOR NOW"
        case .dwelling, .draining: return "SOMETHING'S NEARBY"
        }
    }
}

struct CritterNearbyHeadline: View {
    let state: CritterNearbyActivityAttributes.ContentState
    let size: CGFloat

    var body: some View {
        Text(line)
            .font(.system(size: size, weight: .black))
            .foregroundStyle(LAPalette.paper)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .contentTransition(.numericText())
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .caught: return "YOU FOUND IT"
        case .expired: return "IT SLIPPED AWAY"
        case .draining: return "COME BACK"
        case .dwelling:
            if let minutes = state.remainMin { return "STAY \(minutes) MORE MIN" }
            return state.ring >= CritterRing.steps ? "IT'S RIGHT HERE" : "STAY CLOSE"
        }
    }
}

struct CritterNearbyAdvice: View {
    let attributes: CritterNearbyActivityAttributes
    let state: CritterNearbyActivityAttributes.ContentState

    var body: some View {
        Text(line)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(LAPalette.muted)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var line: LocalizedStringResource {
        switch state.state {
        case .caught: return "Open CritterPass to meet it."
        case .expired: return "It wandered off. It will be back another time."
        case .draining: return "You wandered off. The ring drains slowly, so there is still time."
        case .dwelling:
            if state.ring >= CritterRing.steps {
                return "Open CritterPass and hold still to befriend it."
            }
            if let place = attributes.placeName {
                return "Phone in your pocket is fine. Stay within 50 m of \(place)."
            }
            return "Phone in your pocket is fine. Stay within 50 m."
        }
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
                .fill(CritterNearbyPalette.well)
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
            art
                .resizable()
                .scaledToFit()
                .foregroundStyle(LATone.lilac.opacity(0.55))
                .padding(size * 0.26)
                .blur(radius: CritterRing.blurRadius(stage: state.blurStage, size: size * 0.48))
            if state.state != .caught && size >= 40 {
                Text(verbatim: "?")
                    .font(.system(size: size * 0.26, weight: .black))
                    .foregroundStyle(LAPalette.green)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// The critter's art from the App Group once the app has put it there, else a paw print.
    private var art: Image {
        if state.state == .caught, let found = state.foundKey, let image = LAAppGroupArt.critter(found) {
            return image
        }
        return LAAppGroupArt.critter(attributes.silhouetteKey)?.renderingMode(.template)
            ?? Image(systemName: "pawprint.fill")
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
