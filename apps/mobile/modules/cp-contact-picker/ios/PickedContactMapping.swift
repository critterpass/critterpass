import Contacts
import Foundation

/// The one person the inviter picked, as the invite composer uses it: a name for the "first name"
/// field and the chosen phone number (only for the home-airport hint and the server's hash match).
/// Nothing else from the contact card crosses to JS.
public struct PickedContact: Sendable, Equatable {
  public let name: String
  public let phone: String?

  public init(name: String, phone: String?) {
    self.name = name
    self.phone = phone
  }

  public var dictionary: [String: Any] {
    guard let phone else { return ["name": name] }
    return ["name": name, "phone": phone]
  }
}

/// Pure mapping from the picker's result (Contacts only, so the host-side `swift test` runs on
/// macOS without a simulator). The picker hands back a contact without the app holding any
/// Contacts permission, so every key is read only when the picker supplied it.
public enum PickedContactMapping {
  /// Given name first (the composer asks for a first name), then nickname, family name and
  /// organisation for cards that lack one.
  public static func name(of contact: CNContact) -> String {
    let candidates: [(String, (CNContact) -> String)] = [
      (CNContactGivenNameKey, { $0.givenName }),
      (CNContactNicknameKey, { $0.nickname }),
      (CNContactFamilyNameKey, { $0.familyName }),
      (CNContactOrganizationNameKey, { $0.organizationName }),
    ]
    for (key, read) in candidates where contact.isKeyAvailable(key) {
      let value = read(contact).trimmingCharacters(in: .whitespacesAndNewlines)
      if !value.isEmpty { return value }
    }
    return ""
  }

  /// The number behind a picked property, when the property is a phone number.
  public static func phone(fromPropertyValue value: Any?) -> String? {
    guard let number = value as? CNPhoneNumber else { return nil }
    return nonEmpty(number.stringValue)
  }

  /// A contact picked as a whole carries at most one number (the picker opens the card to choose
  /// when it has more), so that one number is the choice.
  public static func onlyPhone(of contact: CNContact) -> String? {
    guard contact.isKeyAvailable(CNContactPhoneNumbersKey), contact.phoneNumbers.count == 1 else {
      return nil
    }
    return nonEmpty(contact.phoneNumbers[0].value.stringValue)
  }

  /// `nil` when the card offers neither a name nor a number: nothing to prefill.
  public static func picked(_ contact: CNContact, phone: String?) -> PickedContact? {
    let name = name(of: contact)
    if name.isEmpty && phone == nil { return nil }
    return PickedContact(name: name, phone: phone)
  }

  private static func nonEmpty(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
}
