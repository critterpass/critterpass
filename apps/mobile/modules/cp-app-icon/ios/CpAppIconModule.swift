import ExpoModulesCore
import UIKit

/// The home-screen icon switcher. The names are the alternate icons bundled in the app
/// (`CFBundleAlternateIcons`, written by the module's config plugin); `nil` is the primary icon.
/// iOS shows its own "You have changed the icon" alert after every switch; there is no way around it.
public class CpAppIconModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpAppIcon")

    AsyncFunction("isSupported") { () async -> Bool in
      await Self.supportsAlternateIcons()
    }

    AsyncFunction("getCurrent") { () async -> String? in
      await Self.currentName()
    }

    Function("bundledNames") { () -> [String] in
      Self.bundledAlternateIconNames()
    }

    AsyncFunction("set") { (name: String?) async throws -> String? in
      try await Self.apply(name)
    }
  }

  @MainActor
  static func supportsAlternateIcons() -> Bool {
    UIApplication.shared.supportsAlternateIcons
  }

  @MainActor
  static func currentName() -> String? {
    UIApplication.shared.alternateIconName
  }

  @MainActor
  static func apply(_ name: String?) async throws -> String? {
    let application = UIApplication.shared
    guard application.supportsAlternateIcons else { throw AppIconUnsupportedException() }
    if application.alternateIconName == name { return name }
    try await application.setAlternateIconName(name)
    return name
  }

  /// The alternate icon names this app ships, from the compiled Info.plist.
  static func bundledAlternateIconNames() -> [String] {
    guard
      let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
      let alternates = icons["CFBundleAlternateIcons"] as? [String: Any]
    else { return [] }
    return alternates.keys.sorted()
  }
}

final class AppIconUnsupportedException: Exception, @unchecked Sendable {
  override var reason: String { "This device cannot change the app icon" }
}
