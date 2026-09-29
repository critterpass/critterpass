import UIKit
import VisionKit

enum DocumentScanError: Error {
  case unsupported
  case busy
  case noHost
  case encodeFailed
}

enum DocumentScanOutcome: Sendable {
  case captured([String])
  case cancelled
}

/// Presents `VNDocumentCameraViewController`, which finds the page edges, captures on its own once
/// the page is steady and hands back flattened page images. The first `pageLimit` pages are
/// written as JPEGs into the caches directory and returned as `file://` URIs.
@MainActor
final class DocumentScanPresenter: NSObject {
  private static var active: DocumentScanPresenter?
  private var continuation: CheckedContinuation<DocumentScanOutcome, Error>?
  private let pageLimit: Int

  private init(pageLimit: Int) {
    self.pageLimit = max(1, pageLimit)
  }

  static func scan(pageLimit: Int) async throws -> DocumentScanOutcome {
    guard VNDocumentCameraViewController.isSupported else { throw DocumentScanError.unsupported }
    guard active == nil else { throw DocumentScanError.busy }
    guard let host = topViewController() else { throw DocumentScanError.noHost }
    let presenter = DocumentScanPresenter(pageLimit: pageLimit)
    active = presenter
    return try await withCheckedThrowingContinuation { continuation in
      presenter.continuation = continuation
      let camera = VNDocumentCameraViewController()
      camera.delegate = presenter
      host.present(camera, animated: true)
    }
  }

  private func finish(_ controller: UIViewController, _ result: Result<DocumentScanOutcome, Error>)
  {
    controller.dismiss(animated: true)
    continuation?.resume(with: result)
    continuation = nil
    DocumentScanPresenter.active = nil
  }

  private func write(_ scan: VNDocumentCameraScan) throws -> [String] {
    let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("cp-ocr", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return try (0..<min(scan.pageCount, pageLimit)).map { index in
      guard let jpeg = scan.imageOfPage(at: index).jpegData(compressionQuality: 0.9) else {
        throw DocumentScanError.encodeFailed
      }
      let url = directory.appendingPathComponent("\(UUID().uuidString).jpg")
      try jpeg.write(to: url, options: .atomic)
      return url.absoluteString
    }
  }

  private static func topViewController() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
    while let next = top?.presentedViewController { top = next }
    return top
  }
}

extension DocumentScanPresenter: @MainActor VNDocumentCameraViewControllerDelegate {
  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan
  ) {
    let outcome = Result { try write(scan) }.map { uris -> DocumentScanOutcome in
      uris.isEmpty ? .cancelled : .captured(uris)
    }
    finish(controller, outcome)
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    finish(controller, .success(.cancelled))
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController, didFailWithError error: Error
  ) {
    finish(controller, .failure(error))
  }
}
