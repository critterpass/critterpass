import CoreGraphics
import Foundation
import ImageIO
import XCTest

@testable import CpSubjectCutout

/// Straight RGBA8 pixels of an image, top row first, for alpha assertions.
private struct Pixels {
  let width: Int
  let height: Int
  let bytes: [UInt8]

  init(_ image: CGImage) {
    width = image.width
    height = image.height
    var buffer = [UInt8](repeating: 0, count: width * height * 4)
    buffer.withUnsafeMutableBytes { raw in
      let context = CGContext(
        data: raw.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
        bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
      context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    }
    bytes = buffer
  }

  func alpha(_ x: Int, _ y: Int) -> UInt8 { bytes[(y * width + x) * 4 + 3] }

  var corners: [UInt8] {
    [alpha(0, 0), alpha(width - 1, 0), alpha(0, height - 1), alpha(width - 1, height - 1)]
  }

  var opaqueFraction: Double {
    var opaque = 0
    for i in stride(from: 3, to: bytes.count, by: 4) where bytes[i] > 250 { opaque += 1 }
    return Double(opaque) / Double(width * height)
  }
}

/// Fixtures/corgi.jpg: "Fawn and white Welsh Corgi puppy standing on rear legs and sticking out the
/// tongue", Wikimedia Commons, CC0 1.0 (a 500 px rendition).
final class SubjectCutoutTests: XCTestCase {
  private func fixture(_ name: String) throws -> URL {
    try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures"))
  }

  /// Keeps an output PNG for eyeballing when CP_SUBJECT_LIFT_OUT names a directory.
  private func keep(_ image: CGImage, as name: String) throws {
    guard let dir = ProcessInfo.processInfo.environment["CP_SUBJECT_LIFT_OUT"] else { return }
    let url = URL(fileURLWithPath: dir).appendingPathComponent(name)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try SubjectCutout.pngData(image).write(to: url)
  }

  /// A smooth sky-like gradient: nothing in it stands out as a subject.
  private func plainGradient(width: Int = 600, height: Int = 800) -> CGImage {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let context = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0, space: space,
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    let colors = [
      CGColor(srgbRed: 0.55, green: 0.72, blue: 0.93, alpha: 1),
      CGColor(srgbRed: 0.85, green: 0.9, blue: 0.97, alpha: 1),
    ]
    let gradient = CGGradient(colorsSpace: space, colors: colors as CFArray, locations: [0, 1])!
    context.drawLinearGradient(
      gradient, start: .zero, end: CGPoint(x: 0, y: height), options: [])
    return context.makeImage()!
  }

  func testLiftsTheSubjectOfAPhotoIntoACutoutWithAlpha() throws {
    let photo = try SubjectCutout.loadUpright(url: fixture("corgi.jpg"))
    let lifted = try XCTUnwrap(try SubjectCutout.liftSubject(from: photo))
    try keep(lifted, as: "corgi-cutout.png")

    // Cropped to the subject: smaller than the photo, background gone at the corners.
    XCTAssertLessThan(lifted.width, photo.width)
    XCTAssertLessThan(lifted.height, photo.height)
    let pixels = Pixels(lifted)
    XCTAssertEqual(pixels.corners, [0, 0, 0, 0])
    XCTAssertEqual(pixels.alpha(pixels.width / 2, pixels.height / 2), 255)
    XCTAssertGreaterThan(pixels.opaqueFraction, 0.3)

    // The encoded PNG keeps its alpha channel.
    let png = try SubjectCutout.pngData(lifted)
    let decoded = try XCTUnwrap(
      CGImageSourceCreateImageAtIndex(
        try XCTUnwrap(CGImageSourceCreateWithData(png as CFData, nil)), 0, nil))
    XCTAssertTrue([.premultipliedLast, .last, .first, .premultipliedFirst].contains(decoded.alphaInfo))
  }

  func testLaysTheCutoutInsideTheSquareWithRoomForTheOutline() throws {
    let photo = try SubjectCutout.loadUpright(url: fixture("corgi.jpg"))
    let lifted = try XCTUnwrap(try SubjectCutout.liftSubject(from: photo))
    // Through a file, as the app does: the lift writes the cut-out, the layout reads it back.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: dir) }
    let file = try SubjectCutout.writePng(SubjectCutout.pngData(lifted), into: dir)
    let reloaded = try SubjectCutout.loadUpright(url: file)
    XCTAssertEqual(Pixels(reloaded).corners, [0, 0, 0, 0])
    let avatar = try XCTUnwrap(
      SubjectCutout.squareAvatar(from: reloaded, cutout: true, zoom: 1, size: 512))
    try keep(avatar, as: "corgi-avatar.png")

    XCTAssertEqual(avatar.width, 512)
    XCTAssertEqual(avatar.height, 512)
    let pixels = Pixels(avatar)
    XCTAssertEqual(pixels.corners, [0, 0, 0, 0])
    // Top and bottom rows stay clear: the cut-out sits inside the margin.
    XCTAssertEqual((0..<512).map { pixels.alpha($0, 10) }.max(), 0)
    XCTAssertEqual((0..<512).map { pixels.alpha($0, 501) }.max(), 0)
    XCTAssertEqual(pixels.alpha(256, 256), 255)
  }

  func testFindsNoSubjectInAPlainScene() throws {
    XCTAssertNil(try SubjectCutout.liftSubject(from: plainGradient()))
  }

  func testFallsBackToACircleCropOfThePhoto() throws {
    let scene = plainGradient()
    let avatar = try XCTUnwrap(
      SubjectCutout.squareAvatar(from: scene, cutout: false, zoom: 1, size: 256))
    try keep(avatar, as: "no-subject-circle.png")
    let pixels = Pixels(avatar)
    XCTAssertEqual(pixels.corners, [0, 0, 0, 0])
    XCTAssertEqual(pixels.alpha(128, 128), 255)
    XCTAssertEqual(pixels.alpha(128, 2), 255)
    XCTAssertEqual(pixels.alpha(2, 128), 255)

    let photo = try SubjectCutout.loadUpright(url: fixture("corgi.jpg"))
    let circle = try XCTUnwrap(
      SubjectCutout.squareAvatar(from: photo, cutout: false, zoom: 1.5, size: 512))
    try keep(circle, as: "corgi-circle-zoom.png")
  }

  func testPlacementFitsCutoutsAndFillsCircles() {
    let fitted = SubjectCutout.placement(
      width: 200, height: 400, cutout: true, zoom: 1, side: 100)
    XCTAssertEqual(fitted.height, 84, accuracy: 0.001)
    XCTAssertEqual(fitted.width, 42, accuracy: 0.001)
    XCTAssertEqual(fitted.midX, 50, accuracy: 0.001)
    XCTAssertEqual(fitted.midY, 50, accuracy: 0.001)

    let filled = SubjectCutout.placement(
      width: 200, height: 400, cutout: false, zoom: 2, side: 100)
    XCTAssertEqual(filled.width, 200, accuracy: 0.001)
    XCTAssertEqual(filled.height, 400, accuracy: 0.001)
    XCTAssertEqual(filled.midX, 50, accuracy: 0.001)
  }

  func testReadsFileUrisAndPathsOnly() {
    XCTAssertEqual(SubjectCutout.fileURL(from: "file:///tmp/a.jpg")?.path, "/tmp/a.jpg")
    XCTAssertEqual(SubjectCutout.fileURL(from: "/tmp/b.jpg")?.path, "/tmp/b.jpg")
    XCTAssertNil(SubjectCutout.fileURL(from: "https://example.com/a.jpg"))
  }

  func testHashesTheUploadBytes() {
    XCTAssertEqual(
      SubjectCutout.sha256Hex(Data("abc".utf8)),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  }
}
