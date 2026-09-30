// swift-tools-version:6.0
// Host-side tests for the Foundation-only alarm logic: request mapping, the outbox entries the
// alarm intents queue, the schedule file and the signed `/v1/actions` request (no simulator):
//   swift test --package-path apps/mobile/modules/cp-alarm/ios
// The CocoaPods pod (CpAlarm.podspec) excludes this file and Tests/. The App Group store is
// modules/cp-app-group's own source, linked into Tests/AppGroupStoreLink.
import PackageDescription

let package = Package(
  name: "CpAlarmCore",
  platforms: [.macOS(.v14)],
  targets: [
    .target(
      name: "CpAppGroupStore",
      path: "Tests/AppGroupStoreLink"
    ),
    .target(
      name: "CpAlarmCore",
      dependencies: ["CpAppGroupStore"],
      path: ".",
      exclude: [
        "CpAlarm.podspec", "CpAlarmModule.swift", "AlarmScheduler.swift", "AlarmStopIntent.swift",
        "AlarmSnoozeIntent.swift", "Tests",
      ],
      sources: [
        "AlarmPlan.swift", "AlarmOutbox.swift", "AlarmScheduleStore.swift",
        "AlarmActionPoster.swift",
      ]
    ),
    .testTarget(
      name: "CpAlarmCoreTests",
      dependencies: ["CpAlarmCore", "CpAppGroupStore"],
      path: "Tests/CpAlarmCoreTests"
    ),
  ]
)
