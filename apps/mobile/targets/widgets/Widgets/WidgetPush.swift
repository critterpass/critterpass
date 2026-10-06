import Foundation
import WidgetKit

/// Receives the widget extension's push token (iOS 26 WidgetKit push) and leaves it in the App
/// Group, where the app picks it up and registers it with `register_widget_token`.
struct CPWidgetPushHandler: WidgetPushHandler {
    init() {}

    func pushTokenDidChange(_ pushInfo: WidgetPushInfo, widgets: [WidgetInfo]) {
        try? WidgetPushTokenFile(token: pushInfo.token, now: Date()).write(root: AppGroupContainer.url)
    }
}

/// Fetches a fresh snapshot before a timeline is built, at most one request at a time for all the
/// widgets reloading together after a push.
actor WidgetSnapshotFetcher {
    static let shared = WidgetSnapshotFetcher()

    private var running: Task<Void, Never>?

    func refreshIfNeeded(now: Date = Date()) async {
        if let running {
            await running.value
            return
        }
        let root = AppGroupContainer.url
        guard WidgetSnapshotRefresh.needsFetch(current: WidgetSnapshotFile.read(root: root), now: now),
              let request = Self.request(root: root, now: now)
        else { return }
        let task = Task {
            guard let reply = try? await URLSession.shared.data(for: request),
                  let http = reply.1 as? HTTPURLResponse
            else { return }
            WidgetSnapshotRefresh.store(statusCode: http.statusCode, body: reply.0, root: root)
        }
        running = task
        await task.value
        running = nil
    }

    /// `GET /v1/widgets/snapshot` signed with the device action key (scope `read_snapshot`), or
    /// nil before the app has stored a key and its endpoint.
    static func request(root: URL?, now: Date) -> URLRequest? {
        guard let credential = try? ActionKeyStore.read(), credential.allows("read_snapshot"),
              let apiBaseUrl = ActionEndpoints.apiBaseUrl(root: root)
        else { return nil }
        let headers = SignedRequest.sign(
            method: "GET", path: "/v1/widgets/snapshot", body: Data(), keyId: credential.keyId,
            secret: credential.secret, timestamp: now)
        var request = URLRequest(url: apiBaseUrl.appendingPathComponent("v1/widgets/snapshot"))
        request.httpMethod = "GET"
        request.timeoutInterval = 10
        request.setValue(headers.keyId, forHTTPHeaderField: "X-CP-Key-Id")
        request.setValue(headers.timestamp, forHTTPHeaderField: "X-CP-Ts")
        request.setValue(headers.signature, forHTTPHeaderField: "X-CP-Sig")
        return request
    }

    /// Builds a timeline after any refresh that is due, then hands it to WidgetKit.
    nonisolated static func afterRefresh<T>(
        _ completion: @escaping (T) -> Void,
        _ build: @escaping @Sendable (@escaping (T) -> Void) -> Void
    ) {
        let box = CompletionBox(call: completion)
        Task {
            await shared.refreshIfNeeded()
            build(box.call)
        }
    }
}

/// WidgetKit's completion handlers are called once, from any thread.
private struct CompletionBox<T>: @unchecked Sendable {
    let call: (T) -> Void
}
