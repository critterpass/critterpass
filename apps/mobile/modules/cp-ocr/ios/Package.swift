// swift-tools-version:6.0
// Host-side tests for the quality signals and the Vision text and barcode reading (macOS has the
// same Vision requests as iOS, so no simulator is needed):
//   swift test --package-path apps/mobile/modules/cp-ocr/ios
// The CocoaPods pod (CpOcr.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpOcrCore",
  platforms: [.macOS(.v14), .iOS(.v17)],
  targets: [
    .target(
      name: "CpOcrCore",
      path: ".",
      exclude: ["CpOcr.podspec", "CpOcrModule.swift", "DocumentScanPresenter.swift", "Tests"],
      sources: ["OcrSignals.swift", "OcrReader.swift"]
    ),
    .testTarget(
      name: "CpOcrCoreTests",
      dependencies: ["CpOcrCore"],
      path: "Tests"
    ),
  ]
)
