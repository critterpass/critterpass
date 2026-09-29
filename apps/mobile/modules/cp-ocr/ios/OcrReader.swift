import CoreGraphics
import Foundation
import ImageIO
import Vision

public enum OcrReaderError: Error {
  case unreadable
}

/// One recognised line: its text, box (normalised, top-left origin), confidence and baseline.
public struct RecognisedLine: Sendable {
  public let text: String
  public let box: LineBox
  public let conf: Double
  public let baseline: Baseline
}

public struct QualitySignals: Sendable, Equatable {
  public let blur: Double
  public let glare: Double
  public let curvature: Double
  public let clipped: Double
}

public struct Recognition: Sendable {
  /// `ok`, or `unsupported_script` when a hinted script cannot be read (then `lines` is empty).
  public let status: String
  public let lines: [RecognisedLine]
  public let signals: QualitySignals
  public let width: Int
  public let height: Int
}

public struct FoundBarcode: Sendable, Equatable {
  public let format: String
  public let value: String
}

/// Vision text recognition and barcode reading on a still image, free of Expo so it runs in host
/// tests (macOS has the same requests as iOS). The document camera lives in the module target.
public enum OcrReader {
  /// Photos are read at most this long on their longer side: small receipt print stays legible.
  public static let maxSourceSide = 3000

  /// Decodes the image at `url` with its EXIF orientation applied, downscaled to `maxSide`.
  public static func loadUpright(url: URL, maxSide: Int = maxSourceSide) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw OcrReaderError.unreadable
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxSide,
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw OcrReaderError.unreadable
    }
    return image
  }

  /// Accepts `file://` URIs and bare paths (what the scanner and the photo picker hand back).
  public static func fileURL(from uri: String) -> URL? {
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    guard let url = URL(string: uri), url.isFileURL else { return nil }
    return url
  }

  /// The image downscaled to the signal size, as Rec. 601 grey levels.
  public static func grey(_ image: CGImage, maxSide: Int = OcrSignals.signalSide) -> GreyImage? {
    let (w, h) = OcrSignals.scaledSize(width: image.width, height: image.height, maxSide: maxSide)
    guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
    var rgba = [UInt8](repeating: 0, count: w * h * 4)
    let drawn = rgba.withUnsafeMutableBytes { raw -> Bool in
      guard
        let context = CGContext(
          data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
          space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
      else { return false }
      context.interpolationQuality = .medium
      context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      return true
    }
    guard drawn else { return nil }
    var pixels = [UInt8](repeating: 0, count: w * h)
    for i in 0..<(w * h) {
      pixels[i] = OcrSignals.luma(
        red: Int(rgba[i * 4]), green: Int(rgba[i * 4 + 1]), blue: Int(rgba[i * 4 + 2]))
    }
    return GreyImage(width: w, height: h, pixels: pixels)
  }

  /// Vision languages for the trip's hints, or nil when a hinted script cannot be read here. A
  /// hint matches Vision's languages by exact tag, else by primary subtag (`zh` → `zh-Hans`,
  /// `zh-Hant`); a Latin-script language Vision does not list (`id`, `ms`) is read by the Latin
  /// model. English rides along so prices and totals printed in English read too.
  public static func visionLanguages(
    languages: [String], scripts: [String], supported: [String]
  ) -> [String]? {
    func primary(_ tag: String) -> String {
      String(tag.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first ?? "")
    }
    var chosen: [String] = []
    for (index, language) in languages.enumerated() {
      let script = index < scripts.count ? scripts[index] : "latin"
      let exact = supported.filter { $0.caseInsensitiveCompare(language) == .orderedSame }
      let matches = exact.isEmpty ? supported.filter { primary($0) == primary(language) } : exact
      if matches.isEmpty && script != "latin" { return nil }
      for match in matches where !chosen.contains(match) { chosen.append(match) }
    }
    if !languages.isEmpty, !chosen.contains("en-US"), supported.contains("en-US") {
      chosen.append("en-US")
    }
    return chosen
  }

  /// Recognises the image's text lines and measures its quality signals.
  public static func recognize(image: CGImage, languages: [String], scripts: [String]) throws
    -> Recognition
  {
    let grey = grey(image)
    let blur = grey.map(OcrSignals.laplacianVariance) ?? .nan
    let glare = grey.map(OcrSignals.glareRatio) ?? .nan
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let supported = (try? request.supportedRecognitionLanguages()) ?? []
    guard
      let chosen = visionLanguages(languages: languages, scripts: scripts, supported: supported)
    else {
      return Recognition(
        status: "unsupported_script", lines: [],
        signals: QualitySignals(blur: blur, glare: glare, curvature: 0, clipped: 0),
        width: image.width, height: image.height)
    }
    if chosen.isEmpty {
      request.automaticallyDetectsLanguage = true
    } else {
      request.recognitionLanguages = chosen
    }
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let width = Double(image.width)
    let height = Double(image.height)
    let lines = (request.results ?? []).compactMap { observation -> RecognisedLine? in
      guard let best = observation.topCandidates(1).first else { return nil }
      let b = observation.boundingBox
      return RecognisedLine(
        text: best.string,
        box: LineBox(x: b.minX, y: 1 - b.maxY, w: b.width, h: b.height),
        conf: Double(best.confidence),
        baseline: Baseline(
          startX: observation.bottomLeft.x * width, startY: (1 - observation.bottomLeft.y) * height,
          endX: observation.bottomRight.x * width, endY: (1 - observation.bottomRight.y) * height))
    }
    let signals = QualitySignals(
      blur: blur, glare: glare,
      curvature: OcrSignals.curvature(lines.map(\.baseline), imageWidth: width),
      clipped: OcrSignals.clippedShare(lines.map(\.box)))
    return Recognition(
      status: "ok", lines: lines, signals: signals, width: image.width, height: image.height)
  }

  /// Boarding-pass and ticket barcodes (PDF417, Aztec, QR) with a text payload.
  public static func barcodes(image: CGImage) throws -> [FoundBarcode] {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.pdf417, .aztec, .qr]
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    var found: [FoundBarcode] = []
    for observation in request.results ?? [] {
      guard let value = observation.payloadStringValue, !value.isEmpty else { continue }
      let format: String
      switch observation.symbology {
      case .pdf417: format = "pdf417"
      case .aztec: format = "aztec"
      case .qr: format = "qr"
      default: continue
      }
      let barcode = FoundBarcode(format: format, value: value)
      if !found.contains(barcode) { found.append(barcode) }
    }
    return found
  }
}
