import XCTest

@testable import CpOcrCore

/// The signal math on synthetic grey images built in the test; Kotlin `OcrSignalsTest` checks the
/// same cases so both platforms report the same numbers.
final class OcrSignalsTests: XCTestCase {
  private func image(_ width: Int, _ height: Int, _ level: (Int, Int) -> Int) -> GreyImage {
    var pixels = [UInt8](repeating: 0, count: width * height)
    for y in 0..<height {
      for x in 0..<width { pixels[y * width + x] = UInt8(clamping: level(x, y)) }
    }
    return GreyImage(width: width, height: height, pixels: pixels)
  }

  /// Dark 2 px text strokes every 8 px on light paper, like small print (66 px wide: the interior
  /// holds exactly eight periods, so half its columns sit on an edge of Laplacian ±190).
  private func stripes(_ side: Int) -> GreyImage {
    image(side, side) { x, _ in x % 8 < 2 ? 30 : 220 }
  }

  /// A 5×5 box blur: what a shaken hand does to the same strokes.
  private func boxBlur(_ source: GreyImage) -> GreyImage {
    image(source.width, source.height) { x, y in
      var sum = 0
      var count = 0
      for dy in -2...2 {
        for dx in -2...2 {
          let sx = x + dx
          let sy = y + dy
          guard sx >= 0, sy >= 0, sx < source.width, sy < source.height else { continue }
          sum += Int(source.pixels[sy * source.width + sx])
          count += 1
        }
      }
      return sum / count
    }
  }

  func testLaplacianOfASinglePoint() {
    let point = image(5, 5) { x, y in x == 2 && y == 2 ? 100 : 0 }
    XCTAssertEqual(OcrSignals.laplacianVariance(point), 200_000.0 / 9.0, accuracy: 1e-9)
  }

  func testSharpPrintScoresFarAboveItsBlurredCopy() {
    let sharp = stripes(66)
    let soft = boxBlur(sharp)
    XCTAssertEqual(OcrSignals.laplacianVariance(sharp), 18_050, accuracy: 1)
    XCTAssertLessThan(OcrSignals.laplacianVariance(soft), OcrSignals.laplacianVariance(sharp) / 10)
    XCTAssertEqual(OcrSignals.laplacianVariance(image(32, 32) { _, _ in 180 }), 0)
    XCTAssertEqual(OcrSignals.laplacianVariance(image(2, 40) { x, _ in x * 100 }), 0)
  }

  func testGlareIsBlownOutLightBrighterThanThePaper() {
    let hotSpot = image(100, 100) { x, y in x < 10 && y < 10 ? 255 : 200 }
    XCTAssertEqual(OcrSignals.glareRatio(hotSpot), 0.01, accuracy: 1e-12)
    let whiteScan = image(100, 100) { x, _ in x % 10 == 0 ? 0 : 252 }
    XCTAssertEqual(OcrSignals.glareRatio(whiteScan), 0)
    XCTAssertEqual(OcrSignals.glareRatio(image(10, 10) { _, _ in 120 }), 0)
    XCTAssertEqual(OcrSignals.median(image(4, 1) { x, _ in [10, 20, 30, 40][x] }), 30)
  }

  private func baseline(degrees: Double, length: Double = 600, y: Double = 100) -> Baseline {
    let r = degrees * Double.pi / 180
    return Baseline(startX: 50, startY: y, endX: 50 + length * cos(r), endY: y + length * sin(r))
  }

  func testCurvatureIsTheSpreadOfLongBaselineAngles() {
    let tiltedFlat = [4.0, 4.0, 4.0, 4.0].map { baseline(degrees: $0) }
    XCTAssertEqual(OcrSignals.curvature(tiltedFlat, imageWidth: 1000), 0, accuracy: 1e-9)
    let bent = [-4.0, 0.0, 4.0].map { baseline(degrees: $0) }
    XCTAssertEqual(
      OcrSignals.curvature(bent, imageWidth: 1000), (32.0 / 3.0).squareRoot(), accuracy: 1e-9)
    let withNoise =
      bent + [baseline(degrees: 30, length: 100), baseline(degrees: 80), baseline(degrees: -60)]
    XCTAssertEqual(
      OcrSignals.curvature(withNoise, imageWidth: 1000), (32.0 / 3.0).squareRoot(), accuracy: 1e-9)
    XCTAssertEqual(OcrSignals.curvature(Array(bent.prefix(2)), imageWidth: 1000), 0)
  }

  func testClippedCountsBoxesTouchingAnEdge() {
    let boxes = [
      LineBox(x: 0.1, y: 0.1, w: 0.5, h: 0.03),
      LineBox(x: 0.002, y: 0.3, w: 0.5, h: 0.03),
      LineBox(x: 0.6, y: 0.5, w: 0.398, h: 0.03),
      LineBox(x: 0.1, y: 0.97, w: 0.5, h: 0.03),
    ]
    XCTAssertEqual(OcrSignals.clippedShare(boxes), 0.75)
    XCTAssertEqual(OcrSignals.clippedShare([boxes[0]]), 0)
    XCTAssertEqual(OcrSignals.clippedShare([]), 0)
  }

  func testLumaAndSignalSize() {
    XCTAssertEqual(OcrSignals.luma(red: 255, green: 0, blue: 0), 76)
    XCTAssertEqual(OcrSignals.luma(red: 255, green: 255, blue: 255), 255)
    XCTAssertEqual(OcrSignals.luma(red: 0, green: 0, blue: 0), 0)
    XCTAssertTrue(OcrSignals.scaledSize(width: 3000, height: 4000) == (480, 640))
    XCTAssertTrue(OcrSignals.scaledSize(width: 300, height: 200) == (300, 200))
  }
}
