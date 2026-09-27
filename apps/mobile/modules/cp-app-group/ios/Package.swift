// swift-tools-version:6.0
// Host-side tests for the Foundation-only App Group store (no simulator needed):
//   swift test --package-path apps/mobile/modules/cp-app-group/ios
// The CocoaPods pod (CpAppGroup.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpAppGroupStore",
  platforms: [.macOS(.v13), .iOS(.v16)],
  targets: [
    .target(
      name: "CpAppGroupStore",
      path: ".",
      exclude: ["CpAppGroup.podspec", "CpAppGroupModule.swift", "Tests"],
      sources: ["AppGroupStore.swift", "AppGroupSurfaces.swift"]
    ),
    .testTarget(
      name: "AppGroupStoreTests",
      dependencies: ["CpAppGroupStore"],
      path: "Tests",
      exclude: ["Fixtures"]
    ),
  ]
)
