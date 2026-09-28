import ExpoModulesCore
import Foundation

/// The photo-avatar lift for the JS pipeline (src/features/onboarding/photo): `lift` turns a photo
/// into a cut-out PNG with alpha cropped to the subject, `prepare` lays the square avatar PNG that
/// gets uploaded. The image work lives in `SubjectCutout` (host-tested); closures capture nothing
/// but Sendable values (Swift 6 rejects a non-Sendable `self` in @Sendable function closures).
public class CpSubjectLiftModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpSubjectLift")

    // The foreground instance mask needs the device's Neural Engine; the simulator has none, so
    // every photo there takes the circle crop.
    Function("isSupported") { () -> Bool in
      #if targetEnvironment(simulator)
        return false
      #else
        return true
      #endif
    }

    AsyncFunction("lift") { (uri: String) async throws -> [String: Any] in
      let photo = try SubjectCutout.loadUpright(url: try CpSubjectLiftModule.source(uri))
      guard let lifted = try SubjectCutout.liftSubject(from: photo) else {
        return ["found": false]
      }
      let png = try SubjectCutout.pngData(lifted)
      let url = try SubjectCutout.writePng(png, into: CpSubjectLiftModule.outputDir)
      return [
        "found": true, "uri": url.absoluteString, "width": lifted.width, "height": lifted.height,
      ]
    }

    AsyncFunction("prepare") {
      (uri: String, cutout: Bool, zoom: Double, size: Int) async throws -> [String: Any] in
      let image = try SubjectCutout.loadUpright(url: try CpSubjectLiftModule.source(uri))
      guard
        let avatar = SubjectCutout.squareAvatar(
          from: image, cutout: cutout, zoom: zoom, size: size)
      else { throw SubjectCutoutError.encodeFailed }
      let png = try SubjectCutout.pngData(avatar)
      let url = try SubjectCutout.writePng(png, into: CpSubjectLiftModule.outputDir)
      return [
        "uri": url.absoluteString, "sha256": SubjectCutout.sha256Hex(png), "byteLength": png.count,
      ]
    }
  }

  fileprivate static var outputDir: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("cp-subject-lift", isDirectory: true)
  }

  fileprivate static func source(_ uri: String) throws -> URL {
    guard let url = SubjectCutout.fileURL(from: uri) else { throw SubjectCutoutError.unreadable }
    return url
  }
}
