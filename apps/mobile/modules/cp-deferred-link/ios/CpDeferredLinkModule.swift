import ExpoModulesCore
import UIKit

/// First-launch link detection on iOS. `detectPatterns` reports whether the pasteboard probably
/// holds a web URL without reading it, so no paste alert appears; the app then shows a system
/// paste control (`UIPasteControl`) and only a tap by the person hands the link over. The
/// pasteboard is never read silently.
public class CpDeferredLinkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpDeferredLink")

    AsyncFunction("detectLikelyLink") { (promise: Promise) in
      UIPasteboard.general.detectPatterns(for: [.probableWebURL]) { result in
        switch result {
        case .success(let patterns):
          promise.resolve(DeferredLinkDetection.likelyLink(in: patterns))
        case .failure:
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("consumeClipLink") { () -> String? in
      ClipLinkHandoff.consume(
        containerUrl: FileManager.default.containerURL(
          forSecurityApplicationGroupIdentifier: ClipLinkHandoff.appGroup
        )
      )
    }

    // Android-only; iOS has no install referrer.
    AsyncFunction("getInstallReferrer") { () -> String? in
      nil
    }

    AsyncFunction("getReferrerOverride") { () -> String? in
      nil
    }
  }
}

enum DeferredLinkDetection {
  static func likelyLink(in patterns: Set<UIPasteboard.DetectionPattern>) -> Bool {
    patterns.contains(.probableWebURL)
  }
}

/// The link the App Clip was opened with, left in the shared App Group as
/// `state/clip-link.json` (`{"schema": 1, "generated_at": ISO, "url": "https://…"}`; written by
/// `targets/app-clip/ClipInvite.swift`). Read once: the file is removed whatever it holds.
enum ClipLinkHandoff {
  static let appGroup = "group.app.critterpass"
  static let path = "state/clip-link.json"
  static let maxAge: TimeInterval = 7 * 24 * 60 * 60

  private struct File: Decodable {
    let schema: Int
    let generatedAt: String
    let url: String

    enum CodingKeys: String, CodingKey {
      case schema, url
      case generatedAt = "generated_at"
    }
  }

  static func consume(containerUrl: URL?, now: Date = Date()) -> String? {
    guard let containerUrl else { return nil }
    let fileUrl = containerUrl.appendingPathComponent(path)
    guard let data = try? Data(contentsOf: fileUrl) else { return nil }
    try? FileManager.default.removeItem(at: fileUrl)
    return link(in: data, now: now)
  }

  /// The https link a current (schema 1, under a week old) handoff file carries.
  static func link(in data: Data, now: Date) -> String? {
    guard let file = try? JSONDecoder().decode(File.self, from: data), file.schema == 1,
          let url = URL(string: file.url), url.scheme == "https"
    else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let written = formatter.date(from: file.generatedAt)
      ?? ISO8601DateFormatter().date(from: file.generatedAt)
    guard let written, now.timeIntervalSince(written) <= maxAge else { return nil }
    return file.url
  }
}
