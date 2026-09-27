import ExpoModulesCore
import WidgetKit

/// Bridges JS to the shared App Group container (api-contracts-async.md §6) through
/// `AppGroupStore`: coordinated, atomic file access shared with the extensions. Every function is
/// synchronous; these are small local file operations. Validating JSON the app writes is a JS
/// concern (`packages/domain` zod schemas); this module is file I/O only.
public class CpAppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpAppGroup")

    Function("writeSnapshot") { (key: String, json: String) throws in
      try Self.store().write(Self.utf8(json), to: "snapshot/\(key).json")
    }

    Function("writeImage") { (key: String, pngBase64: String) throws in
      guard let data = Data(base64Encoded: pngBase64) else {
        throw CpAppGroupError.invalidBase64
      }
      try Self.store().write(data, to: "assets/\(key).png")
    }

    Function("writeEndpointsConfig") { (json: String) throws in
      try Self.store().write(Self.utf8(json), to: AppGroupStore.endpointsPath)
    }

    Function("readOutbox") { () throws -> String in
      try Self.store().pendingActionsText()
    }

    Function("removeOutboxActions") { (opIds: [String]) throws -> Int in
      try Self.store().removePendingActions(opIds: Set(opIds))
    }

    Function("clearOutbox") { () throws in
      try Self.store().clearPendingActions()
    }

    Function("reloadWidgets") { () in
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  private static func store() throws -> AppGroupStore {
    guard let store = AppGroupStore.shared() else { throw CpAppGroupError.noAppGroupContainer }
    return store
  }

  private static func utf8(_ json: String) throws -> Data {
    guard let data = json.data(using: .utf8) else { throw CpAppGroupError.invalidUtf8 }
    return data
  }
}

enum CpAppGroupError: Error, CustomStringConvertible {
  case invalidUtf8
  case invalidBase64
  case noAppGroupContainer

  var description: String {
    switch self {
    case .invalidUtf8: return "json is not valid UTF-8 text"
    case .invalidBase64: return "pngBase64 is not valid base64 data"
    case .noAppGroupContainer: return "App Group container is unavailable (check the entitlement)"
    }
  }
}
