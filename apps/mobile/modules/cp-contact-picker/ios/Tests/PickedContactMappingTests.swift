import Contacts
import XCTest

@testable import CpContactPickerMapping

final class PickedContactMappingTests: XCTestCase {
  private func card(
    given: String = "", nickname: String = "", family: String = "", organization: String = "",
    phones: [String] = []
  ) -> CNContact {
    let contact = CNMutableContact()
    contact.givenName = given
    contact.nickname = nickname
    contact.familyName = family
    contact.organizationName = organization
    contact.phoneNumbers = phones.map {
      CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: $0))
    }
    return contact.copy() as! CNContact
  }

  func testNamePrefersTheGivenNameThenFallsBack() {
    XCTAssertEqual(PickedContactMapping.name(of: card(given: " Kai ", family: "Tan")), "Kai")
    XCTAssertEqual(PickedContactMapping.name(of: card(nickname: "Mo", family: "Tan")), "Mo")
    XCTAssertEqual(PickedContactMapping.name(of: card(family: "Tan")), "Tan")
    XCTAssertEqual(PickedContactMapping.name(of: card(organization: "Night Market Co")), "Night Market Co")
    XCTAssertEqual(PickedContactMapping.name(of: card()), "")
  }

  func testAPickedPhonePropertyIsTheNumber() {
    XCTAssertEqual(
      PickedContactMapping.phone(fromPropertyValue: CNPhoneNumber(stringValue: "+65 9123 4567")),
      "+65 9123 4567")
    XCTAssertNil(PickedContactMapping.phone(fromPropertyValue: "kai@example.com" as NSString))
    XCTAssertNil(PickedContactMapping.phone(fromPropertyValue: nil))
  }

  func testAWholeContactSharesItsNumberOnlyWhenItHasExactlyOne() {
    XCTAssertEqual(PickedContactMapping.onlyPhone(of: card(phones: ["0901 234 567"])), "0901 234 567")
    XCTAssertNil(PickedContactMapping.onlyPhone(of: card(phones: [])))
    XCTAssertNil(PickedContactMapping.onlyPhone(of: card(phones: ["+1 555 0100", "+1 555 0101"])))
  }

  func testTheResultCarriesOnlyNameAndNumber() {
    let picked = PickedContactMapping.picked(card(given: "Kai", organization: "Acme"), phone: "+6591234567")
    XCTAssertEqual(picked, PickedContact(name: "Kai", phone: "+6591234567"))
    XCTAssertEqual(Set(picked!.dictionary.keys), ["name", "phone"])
    let nameOnly = PickedContactMapping.picked(card(given: "Kai"), phone: nil)
    XCTAssertEqual(Set(nameOnly!.dictionary.keys), ["name"])
  }

  func testAnEmptyCardPrefillsNothing() {
    XCTAssertNil(PickedContactMapping.picked(card(), phone: nil))
    XCTAssertEqual(PickedContactMapping.picked(card(), phone: "+6591234567")?.name, "")
  }
}
