import Foundation
import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// The Notification Content extension for `cp.vote` and `cp.rsvp` (docs/api-contracts-async.md
/// §3.4): long-press opens the poster, with one button per vote option ("Vote Kyoto", up to three)
/// or I'M IN / MAYBE, then OPEN. A button answers here, signed with the device action key, so it
/// works with the phone locked and the app closed; the poster stays open and takes the stamp, and
/// the notification is re-posted under the same identifier with the answer as its line.
final class NotificationViewController: UIViewController, @preconcurrency UNNotificationContentExtension {
    private let state = PosterState()
    private var request: UNNotificationRequest?

    override func viewDidLoad() {
        super.viewDidLoad()
        let hosting = UIHostingController(rootView: PosterRoot(state: state))
        addChild(hosting)
        hosting.view.frame = view.bounds
        hosting.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(hosting.view)
        hosting.didMove(toParent: self)
    }

    func didReceive(_ notification: UNNotification) {
        request = notification.request
        let content = notification.request.content
        let poster = PosterContent(
            category: content.categoryIdentifier, title: content.title, body: content.body,
            userInfo: content.userInfo)
        state.content = poster
        if let stamped = poster?.stamped { state.stamp = .answered(stamped) }
        applyActions(answered: false)
    }

    func didReceive(
        _ response: UNNotificationResponse,
        completionHandler completion: @escaping (UNNotificationContentExtensionResponseOption) -> Void
    ) {
        guard let poster = state.content, poster.stamped == nil,
              let answer = poster.answer(for: response.actionIdentifier)
        else {
            completion(.dismissAndForwardAction)
            return
        }
        state.stamp = .sending(answer.value)
        applyActions(answered: true)
        Task {
            let result = await PosterSender.send(answer)
            show(result, answer: answer, poster: poster)
            completion(.doNotDismiss)
        }
    }

    private func show(_ result: PosterSender.Result, answer: PosterAnswer, poster: PosterContent) {
        switch result {
        case .answered(.accepted(let tallies, let closed, let winner)):
            state.tallies = tallies
            state.stamp = closed ? .closed(winner: winner) : .answered(answer.value)
            repost(poster.stampLine(answer: answer, outcome: .accepted(
                tallies: tallies, closed: closed, winner: winner)), stamp: answer.value)
        case .answered(.closed(let tallies, let winner)):
            state.tallies = tallies
            state.stamp = .closed(winner: winner)
            repost(poster.stampLine(answer: answer, outcome: .closed(tallies: tallies, winner: winner)),
                   stamp: answer.value)
        case .queued:
            state.stamp = .queued(answer.value)
            repost(poster.stampLine(answer: answer, outcome: nil), stamp: answer.value)
        case .answered(.refused), .failed:
            state.stamp = .refused
        }
    }

    /// The buttons follow the poster: the options while it takes an answer, OPEN after.
    private func applyActions(answered: Bool) {
        guard let poster = state.content else { return }
        extensionContext?.notificationActions = poster.actions(answered: answered).map { action in
            UNNotificationAction(
                identifier: action.id, title: action.title,
                options: action.foreground ? [.foreground] : [])
        }
    }

    /// Replaces the delivered notification (same identifier: the push's collapse id) with the
    /// answer as its line, quietly, so the lock screen shows what happened.
    private func repost(_ line: String, stamp: String) {
        guard let request,
              let content = request.content.mutableCopy() as? UNMutableNotificationContent
        else { return }
        content.body = line
        content.sound = nil
        content.interruptionLevel = .passive
        content.userInfo[PosterContent.stampKey] = stamp
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: request.identifier, content: content, trigger: nil)
        ) { _ in }
    }
}
