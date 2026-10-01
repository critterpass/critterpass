import AlarmKit
import ExpoModulesCore
import Foundation

/// The leave-by alarm on iOS (modules/cp-alarm/index.ts): AlarmKit rings through silent mode and
/// Focus. The alarm's buttons run `AlarmStopIntent` / `AlarmSnoozeIntent`, which queue their
/// command in the App Group outbox; this module relays them to JS as `onAlarmAction`.
public class CpAlarmModule: Module {
  private let relay = AlarmEventRelay()

  public func definition() -> ModuleDefinition {
    let relay = self.relay

    Name("CpAlarm")

    Events("onAlarmAction")

    OnCreate {
      relay.module = self
    }

    OnStartObserving {
      relay.start()
    }

    OnStopObserving {
      relay.stop()
    }

    Function("capabilities") { () -> [String: Any] in
      ["engine": "alarmkit", "fullScreenIntent": false]
    }

    Function("authorizationStatus") { () -> String in
      Self.wire(AlarmManager.shared.authorizationState)
    }

    AsyncFunction("requestAuthorization") { () async -> String in
      let state = (try? await AlarmManager.shared.requestAuthorization())
      return Self.wire(state ?? AlarmManager.shared.authorizationState)
    }

    AsyncFunction("schedule") { (request: [String: Any]) async throws -> [String: Any] in
      do {
        let stored = try await AlarmScheduler.schedule(try AlarmRequest.from(request))
        return [
          "leaveById": stored.leaveById, "osAlarmId": stored.osAlarmId, "fireAt": stored.fireAt,
          "state": "scheduled",
        ]
      } catch let error as AlarmPlanError {
        throw Exception(
          name: "AlarmRequest", description: error.description, code: "ERR_ALARM_REQUEST")
      } catch let error as AlarmSchedulerError {
        throw Exception(
          name: "AlarmUnavailable", description: error.description, code: "ERR_ALARM_UNAVAILABLE")
      }
    }

    AsyncFunction("cancel") { (leaveById: String) throws in
      try AlarmScheduler.cancel(leaveById: leaveById)
    }

    AsyncFunction("list") { () throws -> [[String: Any]] in
      try AlarmScheduler.list()
    }

    // Exact-alarm access is an Android page; AlarmKit has none.
    AsyncFunction("openExactAlarmSettings") { () -> Bool in
      false
    }
  }

  static func wire(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    default: return "notDetermined"
    }
  }
}

/// Forwards the alarm intents' broadcasts to JS: a Sendable box around a weak module reference
/// (Expo runs module closures as `@Sendable`, so they never capture the module itself). An action
/// taken while JS is not listening is still in the outbox, which the app drains on launch.
final class AlarmEventRelay: @unchecked Sendable {
  private let lock = NSLock()
  private weak var owner: Module?
  private var token: NSObjectProtocol?

  var module: Module? {
    get { lock.withLock { owner } }
    set { lock.withLock { owner = newValue } }
  }

  func start() {
    stop()
    let observer = NotificationCenter.default.addObserver(
      forName: AlarmActionBroadcast.name, object: nil, queue: nil
    ) { [weak self] note in
      guard let event = note.userInfo as? [String: Any] else { return }
      self?.module?.sendEvent("onAlarmAction", event)
    }
    lock.withLock { token = observer }
  }

  func stop() {
    let observer = lock.withLock { () -> NSObjectProtocol? in
      defer { token = nil }
      return token
    }
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }
}
