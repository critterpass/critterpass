import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// What the album registers about a prepared photo.
struct PreparedPhoto: Sendable {
  let path: String
  let sha256: String
  let bytes: Int64
  let width: Int?
  let height: Int?
  /// EXIF DateTimeOriginal as written by the camera (local time, no zone), when present.
  let takenAt: String?
  /// True once the written file is checked to carry no location.
  let gpsStripped: Bool
}

enum PhotoPrepareError: Error {
  case unreadable
  case unwritable
}

/// Rewrites a photo without its location before it leaves the phone: the GPS dictionary is removed
/// and every other property (orientation, capture time, camera) is kept, in the source's own format
/// (HEIC stays HEIC). The SHA-256 is of the stripped file, the bytes the server stores.
enum PhotoPreparer {
  static func prepare(source: URL, destination: URL) throws -> PreparedPhoto {
    guard let image = CGImageSourceCreateWithURL(source as CFURL, nil),
      let type = CGImageSourceGetType(image)
    else { throw PhotoPrepareError.unreadable }
    let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any] ?? [:]

    try? FileManager.default.removeItem(at: destination)
    guard let output = CGImageDestinationCreateWithURL(destination as CFURL, type, 1, nil)
    else { throw PhotoPrepareError.unwritable }
    // kCFNull removes the dictionary from the copied metadata.
    let removal: [CFString: Any] = [kCGImagePropertyGPSDictionary: kCFNull as Any]
    CGImageDestinationAddImageFromSource(output, image, 0, removal as CFDictionary)
    guard CGImageDestinationFinalize(output) else { throw PhotoPrepareError.unwritable }

    let data = try Data(contentsOf: destination)
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any]
    return PreparedPhoto(
      path: destination.path,
      sha256: digest,
      bytes: Int64(data.count),
      width: properties[kCGImagePropertyPixelWidth] as? Int,
      height: properties[kCGImagePropertyPixelHeight] as? Int,
      takenAt: exif?[kCGImagePropertyExifDateTimeOriginal] as? String,
      gpsStripped: !hasGps(destination)
    )
  }

  static func hasGps(_ url: URL) -> Bool {
    guard let image = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any]
    else { return false }
    return properties[kCGImagePropertyGPSDictionary] != nil
  }
}
