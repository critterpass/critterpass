import Foundation

/// The app's one normalized permission status (`@cp/domain` `PERMISSION_STATUSES`).
public enum NormalizedStatus: String {
  case notDetermined = "not_determined"
  case denied
  case restricted
  case limited
  case provisional
  case granted
}

public struct KindState: Equatable {
  public let status: NormalizedStatus
  public let canAskAgain: Bool

  public init(_ status: NormalizedStatus, canAskAgain: Bool) {
    self.status = status
    self.canAskAgain = canAskAgain
  }

  public var dictionary: [String: Any] { ["status": status.rawValue, "canAskAgain": canAskAgain] }
}

public struct LocationState: Equatable {
  public let state: KindState
  /// `none`, `wiu` (While In Use) or `always`.
  public let level: String
  public let precise: Bool

  public var dictionary: [String: Any] {
    state.dictionary.merging(["level": level, "precise": precise]) { _, new in new }
  }
}

/// Pure mapping from each framework's raw authorization value (Foundation only, so the host-side
/// `swift test` runs without a simulator). Raw values are the frameworks' documented ones.
public enum StatusMapping {
  /// `UNAuthorizationStatus`: 0 notDetermined, 1 denied, 2 authorized, 3 provisional, 4 ephemeral.
  /// Provisional can still be upgraded to full alerts, so the prompt stays available.
  public static func notifications(_ raw: Int) -> KindState {
    switch raw {
    case 0: return KindState(.notDetermined, canAskAgain: true)
    case 2, 4: return KindState(.granted, canAskAgain: false)
    case 3: return KindState(.provisional, canAskAgain: true)
    default: return KindState(.denied, canAskAgain: false)
    }
  }

  /// `CLAuthorizationStatus`: 0 notDetermined, 1 restricted, 2 denied, 3 always, 4 whenInUse.
  /// iOS shows the Always upgrade prompt once; after that only Settings can change it.
  public static func location(_ raw: Int32, fullAccuracy: Bool, alwaysAsked: Bool) -> LocationState {
    switch raw {
    case 0: return LocationState(state: KindState(.notDetermined, canAskAgain: true), level: "none", precise: false)
    case 1: return LocationState(state: KindState(.restricted, canAskAgain: false), level: "none", precise: false)
    case 3: return LocationState(state: KindState(.granted, canAskAgain: false), level: "always", precise: fullAccuracy)
    case 4:
      return LocationState(
        state: KindState(.granted, canAskAgain: !alwaysAsked), level: "wiu", precise: fullAccuracy)
    default: return LocationState(state: KindState(.denied, canAskAgain: false), level: "none", precise: false)
    }
  }

  /// `EKAuthorizationStatus`: 0 notDetermined, 1 restricted, 2 denied, 3 fullAccess, 4 writeOnly.
  public static func calendar(_ raw: Int) -> KindState {
    switch raw {
    case 0: return KindState(.notDetermined, canAskAgain: true)
    case 1: return KindState(.restricted, canAskAgain: false)
    case 3: return KindState(.granted, canAskAgain: false)
    // Write-only cannot read availability; the full-access prompt can still be shown.
    case 4: return KindState(.limited, canAskAgain: true)
    default: return KindState(.denied, canAskAgain: false)
    }
  }

  /// `AVAuthorizationStatus`: 0 notDetermined, 1 restricted, 2 denied, 3 authorized.
  public static func capture(_ raw: Int) -> KindState {
    switch raw {
    case 0: return KindState(.notDetermined, canAskAgain: true)
    case 1: return KindState(.restricted, canAskAgain: false)
    case 3: return KindState(.granted, canAskAgain: false)
    default: return KindState(.denied, canAskAgain: false)
    }
  }

  /// `SFSpeechRecognizerAuthorizationStatus`: 0 notDetermined, 1 denied, 2 restricted, 3 authorized.
  public static func speech(_ raw: Int) -> KindState {
    switch raw {
    case 0: return KindState(.notDetermined, canAskAgain: true)
    case 2: return KindState(.restricted, canAskAgain: false)
    case 3: return KindState(.granted, canAskAgain: false)
    default: return KindState(.denied, canAskAgain: false)
    }
  }

  /// `PHAuthorizationStatus`: 0 notDetermined, 1 restricted, 2 denied, 3 authorized, 4 limited.
  public static func photos(_ raw: Int) -> KindState {
    switch raw {
    case 0: return KindState(.notDetermined, canAskAgain: true)
    case 1: return KindState(.restricted, canAskAgain: false)
    case 3: return KindState(.granted, canAskAgain: false)
    case 4: return KindState(.limited, canAskAgain: false)
    default: return KindState(.denied, canAskAgain: false)
    }
  }

  /// AlarmKit `AlarmManager.AuthorizationState`, passed as 0 notDetermined, 1 denied, 2 authorized.
  public static func alarms(_ raw: Int) -> KindState {
    switch raw {
    case 0: return KindState(.notDetermined, canAskAgain: true)
    case 2: return KindState(.granted, canAskAgain: false)
    default: return KindState(.denied, canAskAgain: false)
    }
  }

  /// Live Activities have no prompt: on or off in Settings.
  public static func liveActivities(enabled: Bool) -> KindState {
    KindState(enabled ? .granted : .denied, canAskAgain: false)
  }
}
