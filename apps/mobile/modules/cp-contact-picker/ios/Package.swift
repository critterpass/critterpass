// swift-tools-version:6.0
// Host-side tests for the picked-contact mapping (Contacts exists on macOS, so no simulator):
//   swift test --package-path apps/mobile/modules/cp-contact-picker/ios
// The CocoaPods pod (CpContactPicker.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpContactPickerMapping",
  platforms: [.macOS(.v13), .iOS(.v16)],
  targets: [
    .target(
      name: "CpContactPickerMapping",
      path: ".",
      exclude: [
        "CpContactPicker.podspec", "CpContactPickerModule.swift", "ContactPickerPresenter.swift",
        "Tests",
      ],
      sources: ["PickedContactMapping.swift"]
    ),
    .testTarget(
      name: "PickedContactMappingTests",
      dependencies: ["CpContactPickerMapping"],
      path: "Tests"
    ),
  ]
)
