import SwiftUI
import WidgetKit

/// The crew widget (5c-2, small or medium), a Boost perk: the meet-up's place and time and the
/// whole crew along a line toward its flag by how far out each member is. Without Boost it shows
/// what it would do and opens the trip.
struct CrewWidget: Widget {
    let kind = "CPCrewWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HomeSnapshotProvider()) { entry in
            CrewWidgetView(entry: entry)
                .containerBackground(for: .widget) { LAPalette.card }
                .widgetURL(LADeepLink.url(route: entry.file?.snapshot.trip.map { "trips/\($0.id)" } ?? "trips"))
        }
        .pushHandler(CPWidgetPushHandler.self)
        .configurationDisplayName("Crew, live")
        .description("Everyone on the way to the meet-up.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct CrewWidgetView: View {
    let entry: HomeWidgetEntry

    var body: some View {
        if let file = entry.file {
            VStack(alignment: .leading, spacing: 4) {
                LAPill(tier: .boost)
                if file.isLocked("crew") {
                    Text("See the crew live")
                        .font(.system(size: 16, weight: .black))
                        .foregroundStyle(LAPalette.paper)
                    Text("Boost the trip to see everyone on the way to the meet-up.")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                    Spacer(minLength: 0)
                } else if let face = CrewFace.make(crew: file.snapshot.crew) {
                    headline(face)
                    Text("\(face.here) of \(face.total) there")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                        .contentTransition(.numericText())
                    Spacer(minLength: 0)
                    CrewLine(face: face)
                } else {
                    Text("No meet-up set.")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(LAPalette.muted)
                    Spacer(minLength: 0)
                }
                HomeWidgetStaleLine(entry: entry)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            HomeWidgetSignedOut()
        }
    }

    @ViewBuilder
    private func headline(_ face: CrewFace) -> some View {
        HStack(spacing: 0) {
            Text(verbatim: face.place?.uppercased() ?? String(localized: "MEET-UP"))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let meetAt = face.meetAt {
                Text(verbatim: " · ")
                Text(meetAt, format: .dateTime.hour().minute())
            }
        }
        .font(.system(size: 15, weight: .black))
        .foregroundStyle(LAPalette.paper)
    }
}

/// The crew's dots along a line, the flag at its right end.
struct CrewLine: View {
    let face: CrewFace

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width - 14
            let mid = geo.size.height / 2
            ZStack {
                Capsule().fill(LAPalette.track).frame(width: width, height: 3).position(x: width / 2, y: mid)
                Image(systemName: "flag.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(LAPalette.yellow)
                    .position(x: geo.size.width - 6, y: mid - 8)
                ForEach(face.dots, id: \.index) { dot in
                    LAMemberDot(initial: dot.initial, tone: dot.index, size: 20)
                        .opacity(dot.known ? 1 : 0.4)
                        .position(x: 10 + (width - 20) * dot.x, y: mid + CGFloat(dot.row) * 10)
                }
            }
        }
        .frame(height: 40)
        .accessibilityHidden(true)
    }
}
