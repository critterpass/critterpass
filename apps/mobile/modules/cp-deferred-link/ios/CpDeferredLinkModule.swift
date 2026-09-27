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

    // Android-only; iOS has no install referrer.
    AsyncFunction("getInstallReferrer") { () -> String? in
      nil
    }
  }
}

enum DeferredLinkDetection {
  static func likelyLink(in patterns: Set<UIPasteboard.DetectionPattern>) -> Bool {
    patterns.contains(.probableWebURL)
  }
}
