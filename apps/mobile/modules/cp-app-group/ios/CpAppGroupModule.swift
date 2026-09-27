import ExpoModulesCore
import WidgetKit

/// Bridges JS to the shared App Group container (api-contracts-async.md §6). Every function is
/// synchronous: these are small local file writes, and going through `AsyncFunction`'s promise +
/// background-queue hop would distort the round-trip timing this spike measures. Validation of
/// the JSON payload itself (schema version, shape) is a JS/TS concern (`packages/domain`); this
/// module is deliberately dumb I/O so native code never has to track schema changes.
public class CpAppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpAppGroup")

    Function("writeSnapshot") { (key: String, json: String) throws in
      guard let data = json.data(using: .utf8) else {
        throw CpAppGroupError.invalidUtf8
      }
      try AppGroupFiles.writeAtomic(data, relativePath: "snapshot/\(key).json")
    }

    Function("writeImage") { (key: String, pngBase64: String) throws in
      guard let data = Data(base64Encoded: pngBase64) else {
        throw CpAppGroupError.invalidBase64
      }
      try AppGroupFiles.writeAtomic(data, relativePath: "assets/\(key).png")
    }

    Function("readOutbox") { () throws -> String in
      try AppGroupFiles.readString(relativePath: "state/pending-actions.json")
        ?? "{\"schema\":1,\"generated_at\":\"\(ISO8601DateFormatter().string(from: Date()))\",\"actions\":[]}"
    }

    Function("reloadWidgets") { () in
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}

enum CpAppGroupError: Error, CustomStringConvertible {
  case invalidUtf8
  case invalidBase64
  case noAppGroupContainer
  case writeFailed(String)

  var description: String {
    switch self {
    case .invalidUtf8: return "json is not valid UTF-8 text"
    case .invalidBase64: return "pngBase64 is not valid base64 data"
    case .noAppGroupContainer: return "App Group container is unavailable (check the entitlement)"
    case .writeFailed(let reason): return "Failed writing to the App Group container: \(reason)"
    }
  }
}

/// Minimal atomic file I/O against the App Group container. Deliberately does not import
/// anything from `apps/mobile/targets/_shared` — that Swift lives in a different compilation
/// target (the extensions' synchronized source group), not this Expo module's own CocoaPods pod.
enum AppGroupFiles {
  static let groupIdentifier = "group.app.critterpass"

  static func writeAtomic(_ data: Data, relativePath: String) throws {
    guard let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier) else {
      throw CpAppGroupError.noAppGroupContainer
    }
    let fileUrl = containerUrl.appendingPathComponent(relativePath)
    do {
      try FileManager.default.createDirectory(at: fileUrl.deletingLastPathComponent(), withIntermediateDirectories: true)
      let tempUrl = fileUrl.appendingPathExtension("tmp-\(UUID().uuidString)")
      try data.write(to: tempUrl, options: .atomic)
      _ = try FileManager.default.replaceItemAt(fileUrl, withItemAt: tempUrl)
    } catch {
      throw CpAppGroupError.writeFailed(error.localizedDescription)
    }
  }

  static func readString(relativePath: String) throws -> String? {
    guard let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupIdentifier) else {
      throw CpAppGroupError.noAppGroupContainer
    }
    let fileUrl = containerUrl.appendingPathComponent(relativePath)
    guard FileManager.default.fileExists(atPath: fileUrl.path) else { return nil }
    return try String(contentsOf: fileUrl, encoding: .utf8)
  }
}
