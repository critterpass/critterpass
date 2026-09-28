// swift-tools-version:6.0
// Host-side tests for the Foundation-only status mapping (no simulator needed):
//   swift test --package-path apps/mobile/modules/cp-permissions/ios
// The CocoaPods pod (CpPermissions.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpPermissionsMapping",
  platforms: [.macOS(.v13), .iOS(.v16)],
  targets: [
    .target(
      name: "CpPermissionsMapping",
      path: ".",
      exclude: ["CpPermissions.podspec", "CpPermissionsModule.swift", "PermissionProbes.swift", "Tests"],
      sources: ["StatusMapping.swift"]
    ),
    .testTarget(
      name: "StatusMappingTests",
      dependencies: ["CpPermissionsMapping"],
      path: "Tests"
    ),
  ]
)
