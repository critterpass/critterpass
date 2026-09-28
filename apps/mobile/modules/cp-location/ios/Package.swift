// swift-tools-version:6.0
// Host-side tests for the Foundation-only planning helpers (no simulator needed):
//   swift test --package-path apps/mobile/modules/cp-location/ios
// The CocoaPods pod (CpLocation.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpLocationPlanMath",
  platforms: [.macOS(.v13), .iOS(.v17)],
  targets: [
    .target(
      name: "CpLocationPlanMath",
      path: ".",
      exclude: [
        "CpLocation.podspec", "CpLocationModule.swift", "SessionManager.swift",
        "MonitorRotation.swift", "FixStream.swift", "Tests",
      ],
      sources: ["LocationPlanMath.swift", "RegionMonitorOwner.swift"]
    ),
    .testTarget(
      name: "LocationPlanMathTests",
      dependencies: ["CpLocationPlanMath"],
      path: "Tests"
    ),
  ]
)
