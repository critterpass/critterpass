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

        AsyncFunction("installed") { () async throws -> [[String: String]] in
            let configurations = try await WidgetCenter.shared.currentConfigurations()
            return configurations.map { info in
                ["kind": info.kind, "family": Self.family(info.family)]
            }
        }
    }

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
