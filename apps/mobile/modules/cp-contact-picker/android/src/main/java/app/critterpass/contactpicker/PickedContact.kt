package app.critterpass.contactpicker

/**
 * The one person the inviter picked, as the invite composer uses it: a name for the "first name"
 * field and the chosen phone number (only for the home-airport hint and the server's hash match).
 * Nothing else from the contact crosses to JS. Pure Kotlin, so the JVM test runs without a device.
 */
data class PickedContact(val name: String, val phone: String?) {
  fun toMap(): Map<String, String> =
    if (phone == null) mapOf("name" to name) else mapOf("name" to name, "phone" to phone)

  companion object {
    /** `RESULT_OK` from `android.app.Activity`, repeated so the mapping stays platform-free. */
    const val RESULT_OK = -1

    /**
     * The picked phone row's columns: display name, the number as stored, and the provider's
     * E.164 form when it could work one out (preferred: it carries the country code the home
     * hint needs). `null` when the user backed out or the row offers nothing to prefill.
     */
    fun fromRow(
      resultCode: Int,
      hasRow: Boolean,
      displayName: String?,
      number: String?,
      normalizedNumber: String?,
    ): PickedContact? {
      if (resultCode != RESULT_OK || !hasRow) return null
      val name = displayName?.trim().orEmpty()
      val phone = normalizedNumber.nonBlank() ?: number.nonBlank()
      if (name.isEmpty() && phone == null) return null
      return PickedContact(name, phone)
    }

    private fun String?.nonBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
  }
}
