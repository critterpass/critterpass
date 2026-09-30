// swift-tools-version:6.0
// Host-side tests for the Foundation-only Live Activity logic (which ActivityKit states reach the
// server, and how), no simulator needed:
//   swift test --package-path apps/mobile/modules/cp-live-activity/ios
// The CocoaPods pod (CpLiveActivity.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpLiveActivityCore",
  platforms: [.macOS(.v14)],
  targets: [
    .target(
      name: "CpLiveActivityCore",
      path: ".",
      exclude: [
        "CpLiveActivity.podspec", "CpLiveActivityModule.swift", "LiveActivityKinds.swift",
        "CPActivityAttributes.swift", "Tests",
      ],
      sources: ["LiveActivityLedger.swift"]
    ),
    .testTarget(
      name: "CpLiveActivityCoreTests",
      dependencies: ["CpLiveActivityCore"],
      path: "Tests/CpLiveActivityCoreTests"
    ),
  ]
)
