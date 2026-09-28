import ExpoModulesCore

/// One status/request/Settings API for every permission the app primes (the JS orchestrator in
/// src/lib/permissions). Every prompt here follows a primer the user toggled on; statuses are
/// normalized by `StatusMapping`.
public class CpPermissionsModule: Module {
  private let probes = PermissionProbes()

  public func definition() -> ModuleDefinition {
    Name("CpPermissions")

    AsyncFunction("getStatus") { (kind: String) async -> [String: Any] in
      await self.probes.status(kind)
    }

    AsyncFunction("request") { (kind: String, level: String?) async -> [String: Any] in
      await self.probes.request(kind, level: level)
    }

    AsyncFunction("requestTemporaryFullAccuracy") { (purposeKey: String) async -> Bool in
      await self.probes.requestTemporaryFullAccuracy(purposeKey: purposeKey)
    }

    Function("getAlarmCapabilities") { () -> [String: Bool] in
      self.probes.alarmCapabilities()
    }

    Function("getLiveActivities") { () -> [String: Bool] in
      self.probes.liveActivities()
    }

    AsyncFunction("openSettings") { (target: String) -> Bool in
      MainActor.assumeIsolated { self.probes.openSettings(target) }
    }.runOnQueue(.main)
  }
}
