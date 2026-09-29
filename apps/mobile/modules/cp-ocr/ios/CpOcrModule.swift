import ExpoModulesCore
import Foundation

/// On-device receipt OCR for the JS layer (modules/cp-ocr/index.ts): `recognize` returns raw lines
/// and quality signals (the JS side orders the lines and names the problem), `scanBarcode` reads
/// PDF417/Aztec/QR, `scanDocument` opens the VisionKit document camera. The image work lives in
/// `OcrReader` and `OcrSignals` (host-tested); closures capture nothing but Sendable values.
public class CpOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpOcr")

    AsyncFunction("recognize") {
      (uri: String, languages: [String], scripts: [String]) async throws -> [String: Any] in
      let image = try OcrReader.loadUpright(url: try CpOcrModule.source(uri))
      let result = try OcrReader.recognize(image: image, languages: languages, scripts: scripts)
      return [
        "status": result.status,
        "observations": result.lines.map { line -> [String: Any] in
          [
            "text": line.text, "bbox": [line.box.x, line.box.y, line.box.w, line.box.h],
            "conf": line.conf,
          ]
        },
        "signals": [
          "blur": result.signals.blur, "glare": result.signals.glare,
          "curvature": result.signals.curvature, "clipped": result.signals.clipped,
        ],
        "width": result.width,
        "height": result.height,
      ]
    }

    AsyncFunction("scanBarcode") { (uri: String) async throws -> [[String: String]] in
      let image = try OcrReader.loadUpright(url: try CpOcrModule.source(uri))
      return try OcrReader.barcodes(image: image).map { ["format": $0.format, "value": $0.value] }
    }

    AsyncFunction("scanDocument") { (pageLimit: Int) async throws -> [String: Any] in
      switch try await DocumentScanPresenter.scan(pageLimit: pageLimit) {
      case .captured(let uris): return ["status": "captured", "uris": uris]
      case .cancelled: return ["status": "cancelled"]
      }
    }
  }

  fileprivate static func source(_ uri: String) throws -> URL {
    guard let url = OcrReader.fileURL(from: uri) else { throw OcrReaderError.unreadable }
    return url
  }
}
