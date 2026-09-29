import CoreGraphics
import CoreImage
import CoreText
import XCTest

@testable import CpOcrCore

/// Vision text and barcode reading on images drawn in the test (the founder's receipt photos land
/// in modules/cp-ocr/fixtures/ and are read by `testFixtureReceipts`).
final class OcrReaderTests: XCTestCase {
  private let space = CGColorSpace(name: CGColorSpace.sRGB)!

  /// Black lines of text on white paper, `lines[0]` at the top.
  private func page(_ lines: [String], width: Int = 1200, height: Int = 900) throws -> CGImage {
    let context = try XCTUnwrap(
      CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
    context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let font = CTFontCreateWithName("Helvetica" as CFString, 64, nil)
    for (index, text) in lines.enumerated() {
      let attributed = NSAttributedString(
        string: text,
        attributes: [
          NSAttributedString.Key(kCTFontAttributeName as String): font,
          NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(
            red: 0, green: 0, blue: 0, alpha: 1),
        ])
      context.textPosition = CGPoint(x: 120, y: CGFloat(height - 200 - index * 160))
      CTLineDraw(CTLineCreateWithAttributedString(attributed), context)
    }
    return try XCTUnwrap(context.makeImage())
  }

  func testReadsPrintedLinesWithTopLeftBoxes() throws {
    let image = try page(["CAFE GIANG", "TOTAL 45000"])
    let result = try OcrReader.recognize(image: image, languages: ["vi"], scripts: ["latin"])
    XCTAssertEqual(result.status, "ok")
    XCTAssertEqual(result.width, 1200)
    let texts = result.lines.map { $0.text.uppercased() }
    let cafe = try XCTUnwrap(
      result.lines.first { $0.text.uppercased().contains("CAFE") }, "\(texts)")
    let total = try XCTUnwrap(
      result.lines.first { $0.text.uppercased().contains("TOTAL") }, "\(texts)")
    XCTAssertLessThan(cafe.box.y, total.box.y, "the first line drawn is nearer the top")
    for line in result.lines {
      XCTAssertGreaterThan(line.conf, 0.3)
      XCTAssertTrue((0...1).contains(line.box.x) && (0...1).contains(line.box.y + line.box.h))
    }
    XCTAssertGreaterThan(result.signals.blur, 40)
    XCTAssertEqual(result.signals.glare, 0)
    XCTAssertEqual(result.signals.clipped, 0)
  }

  func testAScriptVisionCannotReadIsUnsupported() throws {
    let image = try page(["TOTAL 45000"])
    let result = try OcrReader.recognize(image: image, languages: ["tlh"], scripts: ["klingon"])
    XCTAssertEqual(result.status, "unsupported_script")
    XCTAssertTrue(result.lines.isEmpty)
    XCTAssertGreaterThan(result.signals.blur, 0)
  }

  func testLanguageHintsMatchVisionLanguages() {
    let supported = ["en-US", "fr-FR", "zh-Hans", "zh-Hant", "ja-JP", "th-TH", "vi-VT"]
    XCTAssertEqual(
      OcrReader.visionLanguages(languages: ["zh"], scripts: ["chinese"], supported: supported),
      ["zh-Hans", "zh-Hant", "en-US"])
    XCTAssertEqual(
      OcrReader.visionLanguages(
        languages: ["zh-Hant", "th"], scripts: ["chinese", "thai"], supported: supported),
      ["zh-Hant", "th-TH", "en-US"])
    XCTAssertEqual(
      OcrReader.visionLanguages(languages: ["id"], scripts: ["latin"], supported: supported),
      ["en-US"])
    XCTAssertNil(
      OcrReader.visionLanguages(
        languages: ["vi", "el"], scripts: ["latin", "greek"], supported: supported))
    XCTAssertEqual(OcrReader.visionLanguages(languages: [], scripts: [], supported: supported), [])
  }

  func testReadsAQrCode() throws {
    let filter = try XCTUnwrap(CIFilter(name: "CIQRCodeGenerator"))
    filter.setValue(Data("CP-TICKET-42".utf8), forKey: "inputMessage")
    let code = try XCTUnwrap(filter.outputImage).transformed(
      by: CGAffineTransform(scaleX: 12, y: 12))
    let padded = code.transformed(by: CGAffineTransform(translationX: 60, y: 60))
      .composited(
        over: CIImage(color: .white).cropped(
          to: code.extent.insetBy(dx: -60, dy: -60).offsetBy(dx: 60, dy: 60)))
    let image = try XCTUnwrap(CIContext().createCGImage(padded, from: padded.extent))
    XCTAssertEqual(
      try OcrReader.barcodes(image: image), [FoundBarcode(format: "qr", value: "CP-TICKET-42")])
    XCTAssertEqual(try OcrReader.barcodes(image: try page(["NO CODE HERE"])), [])
  }

  /// Real receipt photos in fixtures/ (see fixtures/README.md): every one reads as lines or as an
  /// unsupported script, with finite signals. Skipped until the photos are added.
  func testFixtureReceipts() throws {
    let dir = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
      .appendingPathComponent("fixtures")
    let photos =
      ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil))
      ?? [])
      .filter { ["jpg", "jpeg", "png", "heic"].contains($0.pathExtension.lowercased()) }
    try XCTSkipIf(photos.isEmpty, "no receipt photos in fixtures/ yet")
    for photo in photos {
      let hint =
        photo.deletingPathExtension().lastPathComponent.split(separator: "-").first.map(String.init)
        ?? ""
      let result = try OcrReader.recognize(
        image: try OcrReader.loadUpright(url: photo), languages: [hint],
        scripts: [hint == "th" ? "thai" : hint == "ja" ? "japanese" : "latin"])
      XCTAssertTrue(
        result.status == "unsupported_script" || !result.lines.isEmpty, photo.lastPathComponent)
      XCTAssertTrue(
        result.signals.blur.isFinite && result.signals.glare.isFinite, photo.lastPathComponent)
    }
  }
}
