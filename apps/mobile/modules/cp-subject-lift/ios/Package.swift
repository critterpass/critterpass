// swift-tools-version:6.0
// Host-side tests for the Vision subject lift and avatar layout (macOS 14+ has the same
// foreground instance mask request as iOS 17+, so no simulator is needed):
//   swift test --package-path apps/mobile/modules/cp-subject-lift/ios
// Set CP_SUBJECT_LIFT_OUT=<dir> to keep the cut-out PNGs the tests produce.
// The CocoaPods pod (CpSubjectLift.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpSubjectCutout",
  platforms: [.macOS(.v14), .iOS(.v17)],
  targets: [
    .target(
      name: "CpSubjectCutout",
      path: ".",
      exclude: ["CpSubjectLift.podspec", "CpSubjectLiftModule.swift", "Tests"],
      sources: ["SubjectCutout.swift"]
    ),
    .testTarget(
      name: "SubjectCutoutTests",
      dependencies: ["CpSubjectCutout"],
      path: "Tests",
      resources: [.copy("Fixtures")]
    ),
  ]
)
