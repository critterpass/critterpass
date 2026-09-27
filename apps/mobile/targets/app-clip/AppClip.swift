import Observation
import StoreKit
import SwiftUI

/// The CritterPass App Clip: opened from an invite link in Safari or Messages, it prints the crew
/// ticket from the public preview and offers the full app. The link is left in the App Group the
/// moment the clip opens, so the full app lands on the same invite at first launch.
@main
struct CritterpassClipApp: App {
    @State private var model = ClipModel()

    var body: some Scene {
        WindowGroup {
            TicketScreen(model: model)
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    model.open(activity.webpageURL)
                }
                .task { await model.openWithoutInvocationAfterGrace() }
        }
    }
}

@MainActor
@Observable
final class ClipModel {
    enum Phase: Equatable {
        /// Waiting for the invocation URL.
        case waiting
        case loading(ClipLink)
        case ticket(ClipLink, TicketContent)
        /// Opened without a link the clip understands: a plain "get the app" card.
        case generic
    }

    static let previewTimeout: TimeInterval = 8
    /// How long the clip waits for its invocation before showing the generic card.
    static let invocationGrace: Duration = .milliseconds(800)

    private(set) var phase: Phase = .waiting
    var showsInstallOverlay = false

    func open(_ url: URL?) {
        guard let url, let link = ClipLink(url: url) else {
            phase = .generic
            return
        }
        if case .ticket(let current, _) = phase, current == link { return }
        ClipLinkHandoff.write(url: link.url, containerUrl: AppGroupContainer.url)
        phase = .loading(link)
        Task {
            let preview = await Self.fetchPreview(link)
            guard case .loading(let pending) = phase, pending == link else { return }
            phase = .ticket(link, TicketContent(link: link, preview: preview))
        }
    }

    /// A clip launched from the App Library has no invocation; Xcode and `simctl` local
    /// experiences pass theirs as `_XCAppClipURL`.
    func openWithoutInvocationAfterGrace() async {
        try? await Task.sleep(for: Self.invocationGrace)
        guard phase == .waiting else { return }
        let local = ProcessInfo.processInfo.environment["_XCAppClipURL"].flatMap(URL.init(string:))
        if let local { open(local) } else { phase = .generic }
    }

    private static func fetchPreview(_ link: ClipLink) async -> ClipPreview? {
        var request = URLRequest(url: link.previewUrl)
        request.timeoutInterval = previewTimeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200
        else { return nil }
        return ClipPreview.decode(data)
    }
}
