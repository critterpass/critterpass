import ExpoModulesCore
import WidgetKit

/// The app's side of WidgetKit (modules/cp-widgets/index.ts): reload the widgets' timelines once a
/// new snapshot is in the App Group, and list the widgets placed on this phone (kind and family)
/// for `sync_installed_widgets`.
public class CpWidgetsModule: Module {
    public func definition() -> ModuleDefinition {
        Name("CpWidgets")

        Function("reloadAll") {
            WidgetCenter.shared.reloadAllTimelines()
        }

        Function("reload") { (kind: String) in
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }

        // The widget extension's push token (hex), which its push handler leaves in the App Group
        // (`state/widget-push.json`), or nil before WidgetKit has issued one.
        Function("pushToken") { () -> String? in
            guard
                let root = FileManager.default.containerURL(
                    forSecurityApplicationGroupIdentifier: Self.appGroup),
                let data = try? Data(contentsOf: root.appendingPathComponent("state/widget-push.json")),
                let file = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                file["schema"] as? Int == 1,
                let token = file["token"] as? String, !token.isEmpty
            else { return nil }
            return token
        }

        AsyncFunction("installed") { () async throws -> [[String: String]] in
            let configurations = try await WidgetCenter.shared.currentConfigurations()
            return configurations.map { info in
                ["kind": info.kind, "family": Self.family(info.family)]
            }
        }
    }

    private static let appGroup = "group.app.critterpass"

    /// The family's wire name (packages/domain `WIDGET_FAMILIES`).
    private static func family(_ family: WidgetFamily) -> String {
        switch family {
        case .systemSmall: return "system_small"
        case .systemMedium: return "system_medium"
        case .systemLarge, .systemExtraLarge: return "system_large"
        case .accessoryInline: return "accessory_inline"
        case .accessoryCircular: return "accessory_circular"
        case .accessoryRectangular: return "accessory_rectangular"
        @unknown default: return "system_small"
        }
    }
}
