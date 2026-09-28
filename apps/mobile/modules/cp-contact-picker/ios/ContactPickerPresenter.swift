import Contacts
import ContactsUI
import UIKit

enum ContactPickerError: Error {
  case busy
  case noHost
}

/// Presents `CNContactPickerViewController`, which runs out of process and needs no Contacts
/// permission: the app sees only the contact (and number) the user taps. Contacts with more than
/// one number open their card so the user chooses which number to share.
@MainActor
final class ContactPickerPresenter: NSObject {
  private static var active: ContactPickerPresenter?
  private var continuation: CheckedContinuation<PickedContact?, Never>?

  static func pick() async throws -> PickedContact? {
    guard active == nil else { throw ContactPickerError.busy }
    guard let host = topViewController() else { throw ContactPickerError.noHost }
    let presenter = ContactPickerPresenter()
    active = presenter
    return await withCheckedContinuation { continuation in
      presenter.continuation = continuation
      let picker = CNContactPickerViewController()
      picker.delegate = presenter
      picker.displayedPropertyKeys = [CNContactPhoneNumbersKey]
      picker.predicateForSelectionOfContact = NSPredicate(format: "phoneNumbers.@count <= 1")
      picker.predicateForSelectionOfProperty = NSPredicate(format: "key == 'phoneNumbers'")
      host.present(picker, animated: true)
    }
  }

  private func finish(_ result: PickedContact?) {
    continuation?.resume(returning: result)
    continuation = nil
    ContactPickerPresenter.active = nil
  }

  private static func topViewController() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
    var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
    while let next = top?.presentedViewController { top = next }
    return top
  }
}

extension ContactPickerPresenter: @MainActor CNContactPickerDelegate {
  func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
    finish(nil)
  }

  func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
    finish(PickedContactMapping.picked(contact, phone: PickedContactMapping.onlyPhone(of: contact)))
  }

  func contactPicker(
    _ picker: CNContactPickerViewController, didSelect contactProperty: CNContactProperty
  ) {
    let phone = PickedContactMapping.phone(fromPropertyValue: contactProperty.value)
    finish(PickedContactMapping.picked(contactProperty.contact, phone: phone))
  }
}
