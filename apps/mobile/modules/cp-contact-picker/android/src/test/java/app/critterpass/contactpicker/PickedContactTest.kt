package app.critterpass.contactpicker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PickedContactTest {
  private val ok = PickedContact.RESULT_OK
  private val canceled = 0

  @Test
  fun `a picked row prefers the provider's E164 number`() {
    assertEquals(
      PickedContact("Kai Tan", "+6591234567"),
      PickedContact.fromRow(ok, true, " Kai Tan ", "9123 4567", "+6591234567"),
    )
  }

  @Test
  fun `the stored number is used when the provider could not normalise it`() {
    assertEquals(
      PickedContact("Mai", "0901 234 567"),
      PickedContact.fromRow(ok, true, "Mai", " 0901 234 567 ", null),
    )
    assertEquals(PickedContact("Mai", "0901"), PickedContact.fromRow(ok, true, "Mai", "0901", " "))
  }

  @Test
  fun `backing out or an empty row resolves null`() {
    assertNull(PickedContact.fromRow(canceled, true, "Kai", "+6591234567", null))
    assertNull(PickedContact.fromRow(ok, false, null, null, null))
    assertNull(PickedContact.fromRow(ok, true, " ", null, ""))
  }

  @Test
  fun `only the name and number reach JS`() {
    assertEquals(
      mapOf("name" to "Kai", "phone" to "+6591234567"),
      PickedContact("Kai", "+6591234567").toMap(),
    )
    assertEquals(mapOf("name" to "Kai"), PickedContact("Kai", null).toMap())
  }
}
