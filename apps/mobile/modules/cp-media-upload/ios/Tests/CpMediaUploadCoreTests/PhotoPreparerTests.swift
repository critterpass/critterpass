import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest

@testable import CpMediaUploadCore

final class PhotoPreparerTests: XCTestCase {
  /// A small JPEG carrying a GPS position and a capture time, written with ImageIO.
  private func photoWithLocation() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")
    let context = CGContext(
      data: nil, width: 8, height: 6, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    context.setFillColor(red: 0.2, green: 0.6, blue: 0.4, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: 8, height: 6))
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
    let properties: [CFString: Any] = [
      kCGImagePropertyGPSDictionary: [
        kCGImagePropertyGPSLatitude: 16.0544, kCGImagePropertyGPSLatitudeRef: "N",
        kCGImagePropertyGPSLongitude: 108.2022, kCGImagePropertyGPSLongitudeRef: "E",
      ],
      kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2026:10:04 09:30:00"],
    ]
    CGImageDestinationAddImage(destination, context.makeImage()!, properties as CFDictionary)
    XCTAssertTrue(CGImageDestinationFinalize(destination))
    return url
  }

  func testLocationIsRemovedAndCaptureTimeKept() throws {
    let source = try photoWithLocation()
    XCTAssertTrue(PhotoPreparer.hasGps(source))
    let output = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).jpg")

    let photo = try PhotoPreparer.prepare(source: source, destination: output)

    XCTAssertFalse(PhotoPreparer.hasGps(output))
    XCTAssertTrue(photo.gpsStripped)
    XCTAssertEqual(photo.takenAt, "2026:10:04 09:30:00")
    XCTAssertEqual(photo.width, 8)
    XCTAssertEqual(photo.sha256.count, 64)
    XCTAssertEqual(photo.bytes, Int64(try Data(contentsOf: output).count))
  }

  func testAnUnreadableFileIsRefused() {
    let missing = URL(fileURLWithPath: "/nonexistent/photo.jpg")
    XCTAssertThrowsError(try PhotoPreparer.prepare(source: missing, destination: missing))
  }
}
