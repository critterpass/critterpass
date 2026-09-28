import ExpoModulesCore
import Foundation

/// The system contact picker for the invite composer (modules/cp-contact-picker/index.ts): one
/// person, their name and the chosen number, or `nil` when the user cancels. No Contacts
/// permission is declared or requested. The closure captures nothing but Sendable values.
public class CpContactPickerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CpContactPicker")

    AsyncFunction("pick") { () async throws -> [String: Any]? in
      try await ContactPickerPresenter.pick()?.dictionary
    }
  }
}
