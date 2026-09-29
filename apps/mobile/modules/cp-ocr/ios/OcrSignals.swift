import Foundation

/// A grey image, one 0...255 level per pixel, top row first.
public struct GreyImage: Sendable {
  public let width: Int
  public let height: Int
  public let pixels: [UInt8]

  public init(width: Int, height: Int, pixels: [UInt8]) {
    self.width = width
    self.height = height
    self.pixels = pixels
  }
}

/// A text line's baseline in pixels, top-left origin, from its left end to its right end.
public struct Baseline: Sendable, Equatable {
  public let startX: Double
  public let startY: Double
  public let endX: Double
  public let endY: Double

  public init(startX: Double, startY: Double, endX: Double, endY: Double) {
    self.startX = startX
    self.startY = startY
    self.endX = endX
    self.endY = endY
  }
}

/// A line box `[x, y, w, h]` normalised 0...1, top-left origin.
public struct LineBox: Sendable, Equatable {
  public let x: Double
  public let y: Double
  public let w: Double
  public let h: Double

  public init(x: Double, y: Double, w: Double, h: Double) {
    self.x = x
    self.y = y
    self.w = w
    self.h = h
  }
}

/// The raw quality signals, the same math as Kotlin `OcrSignals` so both platforms report the same
/// numbers for the same photo; the JS side (src/quality.ts) turns them into one named problem.
public enum OcrSignals {
  /// Blur and glare are measured on the grey image downscaled to this longer side.
  public static let signalSide = 640
  /// A box this close to an image edge (share of the side) touches it.
  public static let edgeMargin = 0.005
  /// Lines shorter than this share of the image width have too noisy an angle to count.
  public static let minBaselineShare = 0.2
  /// Steeper lines are vertical or rotated text, not a bent page.
  public static let maxBaselineDegrees = 45.0
  /// A glare pixel is at least this bright…
  public static let glareLevel = 250
  /// …and this much brighter than the paper (the median grey level).
  public static let glareAbovePaper = 25

  /// Rec. 601 luma, rounded, so a colour photo becomes the same grey on both platforms.
  public static func luma(red: Int, green: Int, blue: Int) -> UInt8 {
    UInt8(clamping: (299 * red + 587 * green + 114 * blue + 500) / 1000)
  }

  /// The downscaled size for the signal image: the longer side at most `maxSide`, never upscaled.
  public static func scaledSize(width: Int, height: Int, maxSide: Int = signalSide) -> (Int, Int) {
    let longest = max(width, height)
    guard longest > maxSide, longest > 0 else { return (max(width, 1), max(height, 1)) }
    let scale = Double(maxSide) / Double(longest)
    return (
      max(1, Int((Double(width) * scale).rounded())),
      max(1, Int((Double(height) * scale).rounded()))
    )
  }

  /// Variance of the 4-neighbour Laplacian over the interior pixels: sharp edges give a wide
  /// spread, a soft or shaken photo a narrow one. 0 for an image too small to have an interior.
  public static func laplacianVariance(_ image: GreyImage) -> Double {
    let w = image.width
    let h = image.height
    guard w >= 3, h >= 3, image.pixels.count >= w * h else { return 0 }
    var sum = 0.0
    var sumSquares = 0.0
    image.pixels.withUnsafeBufferPointer { p in
      for y in 1..<(h - 1) {
        let row = y * w
        for x in 1..<(w - 1) {
          let i = row + x
          let value =
            Int(p[i - w]) + Int(p[i + w]) + Int(p[i - 1]) + Int(p[i + 1]) - 4 * Int(p[i])
          let v = Double(value)
          sum += v
          sumSquares += v * v
        }
      }
    }
    let count = Double((w - 2) * (h - 2))
    let mean = sum / count
    return max(0, sumSquares / count - mean * mean)
  }

  /// The lower median grey level.
  static func median(_ image: GreyImage) -> Int {
    var histogram = [Int](repeating: 0, count: 256)
    for level in image.pixels { histogram[Int(level)] += 1 }
    let half = image.pixels.count / 2
    var seen = 0
    for (level, count) in histogram.enumerated() {
      seen += count
      if seen > half { return level }
    }
    return 255
  }

  /// Share of pixels blown out to near-white and clearly brighter than the paper around them: a
  /// reflection on glossy thermal paper. A clean white scan, whose paper is itself near-white, has
  /// none.
  public static func glareRatio(_ image: GreyImage) -> Double {
    guard !image.pixels.isEmpty else { return 0 }
    let floor = max(glareLevel, median(image) + glareAbovePaper)
    guard floor <= 255 else { return 0 }
    var glare = 0
    for level in image.pixels where Int(level) >= floor { glare += 1 }
    return Double(glare) / Double(image.pixels.count)
  }

  /// Standard deviation, in degrees, of the long baselines' angles: a flat page, even tilted,
  /// reads as one angle; a crumpled or folded one bends its lines apart. 0 with fewer than three.
  public static func curvature(_ baselines: [Baseline], imageWidth: Double) -> Double {
    let minLength = minBaselineShare * imageWidth
    var angles: [Double] = []
    for line in baselines {
      let dx = line.endX - line.startX
      let dy = line.endY - line.startY
      guard (dx * dx + dy * dy).squareRoot() >= minLength else { continue }
      let degrees = atan2(dy, dx) * 180 / Double.pi
      guard abs(degrees) <= maxBaselineDegrees else { continue }
      angles.append(degrees)
    }
    guard angles.count >= 3 else { return 0 }
    let mean = angles.reduce(0, +) / Double(angles.count)
    let variance = angles.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(angles.count)
    return variance.squareRoot()
  }

  /// Share of line boxes touching an image edge: text running out of the frame.
  public static func clippedShare(_ boxes: [LineBox]) -> Double {
    guard !boxes.isEmpty else { return 0 }
    let far = 1 - edgeMargin
    let touching = boxes.filter {
      $0.x <= edgeMargin || $0.y <= edgeMargin || $0.x + $0.w >= far || $0.y + $0.h >= far
    }
    return Double(touching.count) / Double(boxes.count)
  }
}
