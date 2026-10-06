// swift-tools-version:6.0
// Host-side tests for the Foundation/ImageIO upload logic: the part bookkeeping a relaunch resumes
// from and the location stripping (no simulator):
//   swift test --package-path apps/mobile/modules/cp-media-upload/ios
// The CocoaPods pod (CpMediaUpload.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpMediaUploadCore",
  platforms: [.macOS(.v14)],
  targets: [
    .target(
      name: "CpMediaUploadCore",
      path: ".",
      exclude: [
        "CpMediaUpload.podspec", "CpMediaUploadModule.swift", "BackgroundSession.swift", "Tests",
      ],
      sources: ["UploadStore.swift", "PhotoPreparer.swift"]
    ),
    .testTarget(
      name: "CpMediaUploadCoreTests",
      dependencies: ["CpMediaUploadCore"],
      path: "Tests/CpMediaUploadCoreTests"
    ),
  ]
)
