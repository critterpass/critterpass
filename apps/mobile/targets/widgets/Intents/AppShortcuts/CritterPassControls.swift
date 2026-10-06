internal import AppIntents
import SwiftUI
import WidgetKit

// Control Center buttons (docs/api-contracts-async.md §4, `Control Center` row).

/// I'M UP for the next leave-by, from Control Center or the lock screen: the same intent as the
/// Live Activity's button, so the crew's pips fill the same way.
struct ImUpControl: ControlWidget {
    static let kind = "CPImUpControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind, provider: NextLeaveByControlProvider()) { leaveById in
            ControlWidgetButton(action: ImUpIntent(leaveById: leaveById)) {
                Label("I'm up", systemImage: "sun.max.fill")
            }
            .disabled(leaveById.isEmpty)
        }
        .displayName("I'm up")
        .description("Tells your crew you're ready for the next leave-by.")
    }
}

/// The next leave-by's id from the widget snapshot, empty when there is none.
struct NextLeaveByControlProvider: ControlValueProvider {
    var previewValue: String { "" }

    func currentValue() async throws -> String {
        WidgetSnapshotFile.read(root: AppGroupContainer.url)?.snapshot.nextLeaveBy?.id ?? ""
    }
}

/// SOS is never one tap: the control opens the app's SOS screen, which asks and gives five
/// seconds to cancel.
struct SOSControl: ControlWidget {
    static let kind = "CPSOSControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: SOSOpenIntent()) {
                Label("SOS", systemImage: "sos")
            }
        }
        .displayName("SOS")
        .description("Opens SOS to alert your crew.")
    }
}

struct SOSOpenIntent: AppIntent {
    static let title: LocalizedStringResource = "SOS"
    static let description = IntentDescription("Opens SOS to alert your crew.")

    func perform() async throws -> some IntentResult & OpensIntent {
        guard let url = LADeepLink.url(route: "sos/send") else { return .result() }
        return .result(opensIntent: OpenURLIntent(url))
    }
}
