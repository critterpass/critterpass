// swift-tools-version:6.0
// Host-side XCTests for the extension targets' Foundation-only logic (no simulator needed):
//   pnpm --filter @cp/mobile ios:test
// Xcode never reads this manifest: `@bacons/apple-targets` builds each target from its own
// directory, and the test files there compile to nothing outside this package
// (`CP_TARGET_TESTS` is defined only below).
import PackageDescription

let testSettings: [SwiftSetting] = [.define("CP_TARGET_TESTS")]

let package = Package(
  name: "CritterpassTargets",
  platforms: [.macOS(.v14)],
  targets: [
    .target(
      name: "NotificationServiceCore",
      path: ".",
      sources: [
        "_shared/SnapshotEnvelope.swift",
        "_shared/PushPayload/CPPayload.swift",
        "notification-service/SenderIdentity.swift",
        "notification-service/AvatarLoader.swift",
      ]
    ),
    .testTarget(
      name: "NotificationServiceTests",
      dependencies: ["NotificationServiceCore"],
      path: "notification-service/Tests",
      swiftSettings: testSettings
    ),
  ]
)
