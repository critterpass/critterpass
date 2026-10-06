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
      // Other targets, and the art `expo prebuild` copies into each target directory.
      exclude: [
        "widgets", "notification-content", "app-clip", "notification-service/Tests",
        "notification-service/CritterArt.xcassets",
      ],
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
    .target(
      name: "AppClipCore",
      path: "app-clip",
      exclude: [
        "AppClip.swift", "TicketView.swift", "Assets.xcassets", "Info.plist",
        "expo-target.config.js", "Tests",
      ],
      sources: ["ClipInvite.swift"]
    ),
    .target(
      name: "PendingActionsCore",
      path: "_shared",
      exclude: ["PushPayload"],
      sources: [
        "PendingActionsOutbox.swift", "Intents/SignedActionSender.swift",
        "ActionKey/SignedRequest.swift", "ActionKey/ActionKeyStore.swift",
      ]
    ),
    .testTarget(
      name: "PendingActionsTests",
      dependencies: ["PendingActionsCore"],
      path: "widgets/Tests",
      exclude: ["Fixtures"],
      swiftSettings: testSettings
    ),
    .testTarget(
      name: "AppClipTests",
      dependencies: ["AppClipCore"],
      path: "app-clip/Tests",
      swiftSettings: testSettings
    ),
    .target(
      name: "WidgetSnapshotCore",
      path: "_shared",
      exclude: ["ActionKey", "PushPayload", "ActivityAttributes", "Intents", "Snapshot/Tests"],
      sources: [
        "Snapshot/WidgetSnapshot.swift", "Snapshot/WidgetSnapshotReader.swift",
        "Snapshot/HomeWidgetModels.swift", "Snapshot/PendingVote.swift",
        "Snapshot/TripWidgetModels.swift", "Snapshot/WidgetTaps.swift",
      ]
    ),
    .testTarget(
      name: "WidgetSnapshotTests",
      dependencies: ["WidgetSnapshotCore"],
      path: "_shared/Snapshot/Tests",
      exclude: ["Fixtures"],
      swiftSettings: testSettings
    ),
    .target(
      name: "LiveActivityLogicCore",
      path: "_shared/ActivityAttributes",
      exclude: ["CPActivityAttributes.swift", "Tests"],
      sources: ["LiveActivityLogic.swift", "LeaveBySending.swift"]
    ),
    .testTarget(
      name: "LiveActivityLogicTests",
      dependencies: ["LiveActivityLogicCore"],
      path: "_shared/ActivityAttributes/Tests",
      swiftSettings: testSettings
    ),
  ]
)
