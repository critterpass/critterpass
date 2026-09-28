import ExpoModulesCore

/// One status/request/Settings API for every permission the app primes (the JS orchestrator in
/// src/lib/permissions). Every prompt here follows a primer the user toggled on; statuses are
/// normalized by `StatusMapping`.
public class CpPermissionsModule: Module {
  private let probes = PermissionProbes()

  public func definition() -> ModuleDefinition {
    // The probes object is Sendable; the module isn't, so closures capture `probes`, never `self`
    // (Swift 6 rejects a non-Sendable `self` inside the @Sendable async function closures).
    let probes = self.probes

    Name("CpPermissions")

    AsyncFunction("getStatus") { (kind: String) async -> [String: Any] in
      await self.probes.status(kind)
    }

    AsyncFunction("request") { (kind: String, level: String?) async -> [String: Any] in
      await probes.request(kind, level: level)
    }

    AsyncFunction("requestTemporaryFullAccuracy") { (purposeKey: String) async -> Bool in
      await probes.requestTemporaryFullAccuracy(purposeKey: purposeKey)
    }

    Function("getAlarmCapabilities") { () -> [String: Bool] in
      probes.alarmCapabilities()
    }

    Function("getLiveActivities") { () -> [String: Bool] in
      probes.liveActivities()
    }

    AsyncFunction("openSettings") { (target: String) -> Bool in
      MainActor.assumeIsolated { probes.openSettings(target) }
    }.runOnQueue(.main)
  }
}
