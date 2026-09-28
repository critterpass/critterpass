import ActivityKit
import AlarmKit
import AVFoundation
import CoreLocation
import EventKit
import Photos
import Speech
import UIKit
import UserNotifications

/// Status and request per permission kind over the system frameworks, kept free of Expo types so
/// it type-checks on its own against the iOS SDK. Every prompt follows a primer the user toggled
/// on; statuses are normalized by `StatusMapping`.
final class PermissionProbes: @unchecked Sendable {
  private static let alwaysAskedKey = "cp.permissions.location.alwaysAsked"
  private let locationRequester = LocationAuthorizationRequester()

  func requestTemporaryFullAccuracy(purposeKey: String) async -> Bool {
    await locationRequester.requestTemporaryFullAccuracy(purposeKey: purposeKey)
  }

  func alarmCapabilities() -> [String: Bool] {
    let authorized = AlarmManager.shared.authorizationState == .authorized
    return ["exactAlarm": authorized, "fullScreenIntent": authorized]
  }

  func liveActivities() -> [String: Bool] {
    let info = ActivityAuthorizationInfo()
    return ["enabled": info.areActivitiesEnabled, "frequent": info.frequentPushesEnabled]
  }

  @MainActor
  func openSettings(_ target: String) -> Bool {
    let raw = target == "notifications"
      ? UIApplication.openNotificationSettingsURLString
      : UIApplication.openSettingsURLString
    guard let url = URL(string: raw) else { return false }
    UIApplication.shared.open(url)
    return true
  }

  private var alwaysAsked: Bool { UserDefaults.standard.bool(forKey: Self.alwaysAskedKey) }

  func status(_ kind: String) async -> [String: Any] {
    switch kind {
    case "notifications":
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      var dict = StatusMapping.notifications(settings.authorizationStatus.rawValue).dictionary
      dict["timeSensitive"] = settings.timeSensitiveSetting == .enabled
      return dict
    case "alarms":
      return StatusMapping.alarms(alarmRaw(AlarmManager.shared.authorizationState)).dictionary
    case "location":
      return locationState().dictionary
    case "calendar":
      return StatusMapping.calendar(EKEventStore.authorizationStatus(for: .event).rawValue).dictionary
    case "camera":
      return StatusMapping.capture(AVCaptureDevice.authorizationStatus(for: .video).rawValue).dictionary
    case "microphone":
      return StatusMapping.capture(AVCaptureDevice.authorizationStatus(for: .audio).rawValue).dictionary
    case "speech":
      return StatusMapping.speech(SFSpeechRecognizer.authorizationStatus().rawValue).dictionary
    case "photos_add":
      return StatusMapping.photos(PHPhotoLibrary.authorizationStatus(for: .addOnly).rawValue).dictionary
    case "photos_read":
      return StatusMapping.photos(PHPhotoLibrary.authorizationStatus(for: .readWrite).rawValue).dictionary
    case "live_activities":
      return StatusMapping.liveActivities(enabled: ActivityAuthorizationInfo().areActivitiesEnabled).dictionary
    default:
      return KindState(.restricted, canAskAgain: false).dictionary
    }
  }

  func request(_ kind: String, level: String?) async -> [String: Any] {
    switch kind {
    case "notifications":
      var options: UNAuthorizationOptions = [.alert, .badge, .sound]
      if level == "provisional" { options.insert(.provisional) }
      _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: options)
    case "alarms":
      _ = try? await AlarmManager.shared.requestAuthorization()
    case "location":
      if level == "always" { UserDefaults.standard.set(true, forKey: Self.alwaysAskedKey) }
      await locationRequester.request(always: level == "always")
    case "calendar":
      _ = try? await EKEventStore().requestFullAccessToEvents()
    case "camera":
      _ = await AVCaptureDevice.requestAccess(for: .video)
    case "microphone":
      _ = await AVCaptureDevice.requestAccess(for: .audio)
    case "speech":
      _ = await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
        SFSpeechRecognizer.requestAuthorization { _ in done.resume() }
      }
    case "photos_add":
      _ = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
    case "photos_read":
      _ = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
    default:
      break
    }
    return await status(kind)
  }

  private func locationState() -> LocationState {
    let manager = CLLocationManager()
    return StatusMapping.location(
      manager.authorizationStatus.rawValue,
      fullAccuracy: manager.accuracyAuthorization == .fullAccuracy,
      alwaysAsked: alwaysAsked)
  }

  private func alarmRaw(_ state: AlarmManager.AuthorizationState) -> Int {
    switch state {
    case .notDetermined: return 0
    case .authorized: return 2
    default: return 1
    }
  }
}

/// Awaits the answer to one location prompt. The answer arrives either as an authorization change
/// or, when the user keeps the current level ("Keep Only While Using"), as nothing at all — so the
/// app becoming active again after the system alert also ends the wait. The manager lives on the
/// main thread (CoreLocation delivers delegate calls on the thread that created it).
final class LocationAuthorizationRequester: NSObject, CLLocationManagerDelegate, @unchecked Sendable {
  private var manager: CLLocationManager?
  private var pending: CheckedContinuation<Void, Never>?
  private var before: CLAuthorizationStatus = .notDetermined
  private var activeObserver: NSObjectProtocol?

  @MainActor
  func request(always: Bool) async {
    let manager = self.manager ?? CLLocationManager()
    manager.delegate = self
    self.manager = manager
    before = manager.authorizationStatus
    // Always can only be asked from While In Use; from "not determined" the first answer is WIU.
    if always, before != .authorizedWhenInUse { return }
    if !always, before != .notDetermined { return }
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
      pending = done
      activeObserver = NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
      ) { [weak self] _ in self?.finish() }
      if always { manager.requestAlwaysAuthorization() } else { manager.requestWhenInUseAuthorization() }
    }
  }

  @MainActor
  func requestTemporaryFullAccuracy(purposeKey: String) async -> Bool {
    let manager = self.manager ?? CLLocationManager()
    self.manager = manager
    if manager.accuracyAuthorization == .fullAccuracy { return true }
    try? await manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: purposeKey)
    return manager.accuracyAuthorization == .fullAccuracy
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    // Setting the delegate reports the current state once; only a real change ends the wait.
    guard manager.authorizationStatus != before else { return }
    finish()
  }

  private func finish() {
    if let observer = activeObserver { NotificationCenter.default.removeObserver(observer) }
    activeObserver = nil
    pending?.resume()
    pending = nil
  }
}
