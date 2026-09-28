import CoreGraphics
import CoreImage
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

public enum SubjectCutoutError: Error {
  case unreadable
  case encodeFailed
}

/// The photo-avatar image work, free of Expo so it runs in host tests: load a photo upright, lift
/// its subject with Vision's foreground instance mask (a PNG with alpha cropped to the subject),
/// and lay out the square avatar PNG, either the cut-out or a circle crop when no subject was found.
public enum SubjectCutout {
  /// Photos are read at most this long on their longer side; plenty for a 512 px avatar.
  public static let maxSourceSide = 1600

  /// Room kept around a cut-out inside the square so the white sticker outline is not clipped.
  static let cutoutMargin = 0.08

  private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

  /// Decodes the photo at `url` with its EXIF orientation applied, downscaled to `maxSide`.
  public static func loadUpright(url: URL, maxSide: Int = maxSourceSide) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw SubjectCutoutError.unreadable
    }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxSide,
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw SubjectCutoutError.unreadable
    }
    return image
  }

  /// The subject(s) Vision finds, masked to alpha and cropped to their bounds; nil when none.
  public static func liftSubject(from image: CGImage) throws -> CGImage? {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      return nil
    }
    let masked = try observation.generateMaskedImage(
      ofInstances: observation.allInstances, from: handler, croppedToInstancesExtent: true)
    let ciImage = CIImage(cvPixelBuffer: masked)
    let context = CIContext(options: [.workingColorSpace: colorSpace])
    return context.createCGImage(
      ciImage, from: ciImage.extent, format: .RGBA8, colorSpace: colorSpace)
  }

  /// The square avatar: a cut-out fitted inside a margin, or the centre square clipped to a
  /// circle. `zoom` ≥ 1 scales up around the centre (a tighter crop); outside stays transparent.
  public static func squareAvatar(from image: CGImage, cutout: Bool, zoom: Double, size: Int)
    -> CGImage?
  {
    guard
      let context = CGContext(
        data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
        space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    context.interpolationQuality = .high
    let side = Double(size)
    let rect = placement(
      width: Double(image.width), height: Double(image.height), cutout: cutout,
      zoom: max(1, zoom), side: side)
    if !cutout {
      context.addEllipse(in: CGRect(x: 0, y: 0, width: side, height: side))
      context.clip()
    }
    context.draw(image, in: rect)
    return context.makeImage()
  }

  /// Where the source lands in the square (CoreGraphics coordinates): a cut-out is fitted (contain)
  /// inside the outline margin, a photo fills (cover) the circle; both centred, then zoomed.
  static func placement(width: Double, height: Double, cutout: Bool, zoom: Double, side: Double)
    -> CGRect
  {
    let box = cutout ? side * (1 - 2 * cutoutMargin) : side
    let fit = cutout ? min(box / width, box / height) : max(box / width, box / height)
    let scale = fit * zoom
    let w = width * scale
    let h = height * scale
    return CGRect(x: (side - w) / 2, y: (side - h) / 2, width: w, height: h)
  }

  public static func pngData(_ image: CGImage) throws -> Data {
    let data = NSMutableData()
    guard
      let destination = CGImageDestinationCreateWithData(
        data as CFMutableData, UTType.png.identifier as CFString, 1, nil)
    else { throw SubjectCutoutError.encodeFailed }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw SubjectCutoutError.encodeFailed }
    return data as Data
  }

  public static func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  /// Accepts `file://` URIs and bare paths (what the photo pickers hand back).
  public static func fileURL(from uri: String) -> URL? {
    if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
    guard let url = URL(string: uri), url.isFileURL else { return nil }
    return url
  }

  /// Writes a PNG into `directory` under a fresh name and returns its URL.
  public static func writePng(_ data: Data, into directory: URL) throws -> URL {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = directory.appendingPathComponent("\(UUID().uuidString).png")
    try data.write(to: url, options: .atomic)
    return url
  }
}
