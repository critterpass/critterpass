// swift-tools-version:6.0
// Host-side tests for the Foundation-only day reduction (no simulator, no calendar access):
//   swift test --package-path apps/mobile/modules/cp-calendar/ios
// The CocoaPods pod (CpCalendar.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpCalendarReduction",
  platforms: [.macOS(.v13), .iOS(.v16)],
  targets: [
    .target(
      name: "CpCalendarReduction",
      path: ".",
      exclude: ["CpCalendar.podspec", "CpCalendarModule.swift", "CalendarWriter.swift", "Tests"],
      sources: ["BusyDayReducer.swift"]
    ),
    .testTarget(
      name: "BusyDayReducerTests",
      dependencies: ["CpCalendarReduction"],
      path: "Tests"
    ),
  ]
)
