import Foundation
import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// Hello-world Notification Content extension for the `cp.vote` category
/// (api-contracts-async.md §3.4): an animated poster with vote actions, reachable with the
/// device locked and the app killed. Real poster art/tallies land in the surface phase; this
/// scaffold proves the target builds, signs, hosts SwiftUI, and can sign a `/v1/actions` call.
final class NotificationViewController: UIViewController, UNNotificationContentExtension {
    private var pollQuestion: String = ""
    private var optionLabels: [String] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        embedPosterView()
    }

    func didReceive(_ notification: UNNotification) {
        let userInfo = notification.request.content.userInfo
        let cp = userInfo["cp"] as? [String: Any]
        let ctx = cp?["ctx"] as? [String: Any]
        pollQuestion = notification.request.content.body
        optionLabels = (ctx?["options"] as? [[String: Any]])?.compactMap { $0["label"] as? String } ?? []
        embedPosterView()
    }

    func didReceive(
        _ response: UNNotificationResponse,
        completionHandler completion: @escaping (UNNotificationContentExtensionResponseOption) -> Void
    ) {
        Task {
            await castBallot(actionIdentifier: response.actionIdentifier, userInfo: response.notification.request.content.userInfo)
            completion(.doNotDismiss)
        }
    }

    private func embedPosterView() {
        children.forEach { $0.willMove(toParent: nil); $0.view.removeFromSuperview(); $0.removeFromParent() }
        let hosting = UIHostingController(rootView: VotePosterView(question: pollQuestion, options: optionLabels))
        addChild(hosting)
        hosting.view.frame = view.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hosting.view)
        hosting.didMove(toParent: self)
    }

    private func castBallot(actionIdentifier: String, userInfo: [AnyHashable: Any]) async {
        guard
            actionIdentifier.hasPrefix("VOTE_"),
            let cp = userInfo["cp"] as? [String: Any],
            let ctx = cp["ctx"] as? [String: Any],
            let pollId = ctx["poll_id"] as? String,
            let key = try? KeychainActionKeyStore.read(),
            let apiBaseUrl = EndpointsConfig.readApiBaseUrl()
        else {
            return
        }
        let optionIndex = Int(actionIdentifier.dropFirst("VOTE_".count)).map { $0 - 1 } ?? 0
        let options = (ctx["options"] as? [[String: Any]]) ?? []
        guard optionIndex >= 0, optionIndex < options.count, let optionId = options[optionIndex]["id"] as? String else {
            return
        }

        guard let request = try? ActionsClient.buildRequest(
            path: "/v1/actions",
            command: "cast_ballot",
            scope: "ballot",
            payload: ["poll_id": pollId, "option_id": optionId],
            key: key,
            apiBaseUrl: apiBaseUrl
        ) else {
            return
        }
        _ = try? await URLSession.shared.data(for: request)
    }
}

private struct VotePosterView: View {
    let question: String
    let options: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(question)
                .font(.headline)
            ForEach(Array(options.enumerated()), id: \.offset) { _, label in
                Text(label)
                    .font(.subheadline)
            }
        }
        .padding()
    }
}

/// Reads `config/endpoints.json` (api-contracts-async.md §6) so the spike never hardcodes a host.
private enum EndpointsConfig {
    private struct Payload: Codable {
        let schema: Int
        let apiBaseUrl: String

        enum CodingKeys: String, CodingKey {
            case schema
            case apiBaseUrl = "api_base_url"
        }
    }

    static func readApiBaseUrl() -> URL? {
        guard
            let containerUrl = AppGroupContainer.url,
            let data = try? Data(contentsOf: containerUrl.appendingPathComponent("config/endpoints.json")),
            let payload = try? SnapshotDecoder.decode(Payload.self, from: data, supportedSchemas: 1...1)
        else {
            return nil
        }
        return URL(string: payload.apiBaseUrl)
    }
}
