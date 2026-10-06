// swift-tools-version:6.0
// Host-side tests for the voice activity detector, the level maths and the reply chunk queue
// (plain Swift, no audio hardware):
//   swift test --package-path apps/mobile/modules/cp-speech/ios
// The CocoaPods pod (CpSpeech.podspec) excludes this file and Tests/.
import PackageDescription

let package = Package(
  name: "CpSpeechCore",
  platforms: [.macOS(.v14), .iOS(.v17)],
  targets: [
    .target(
      name: "CpSpeechCore",
      path: ".",
      exclude: [
        "CpSpeech.podspec", "CpSpeechModule.swift", "SpeechAudio.swift", "SpeechTranscription.swift",
        "ReplyPlayer.swift", "FixtureInput.swift", "Tests",
      ],
      sources: ["Vad.swift", "Levels.swift", "ChunkQueue.swift"]
    ),
    .testTarget(
      name: "CpSpeechCoreTests",
      dependencies: ["CpSpeechCore"],
      path: "Tests"
    ),
  ]
)
