package app.critterpass.contactpicker

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract.CommonDataKinds.Phone
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The system contact picker for one phone row (`ACTION_PICK` on `Phone.CONTENT_URI`). The result
 * intent grants temporary read access to the picked row's URI, so the app reads its name and
 * number without holding the Contacts read permission; none is declared. Resolves `null`
 * when the user backs out.
 */
class CpContactPickerModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("CpContactPicker")

    AsyncFunction("pick") { promise: Promise ->
      if (pending != null) {
        promise.reject(CodedException("ERR_PICKER_BUSY", "The contact picker is already open", null))
        return@AsyncFunction
      }
      val activity = appContext.throwingActivity
      pending = promise
      try {
        activity.startActivityForResult(Intent(Intent.ACTION_PICK, Phone.CONTENT_URI), REQUEST_CODE)
      } catch (e: ActivityNotFoundException) {
        pending = null
        promise.reject(CodedException("ERR_PICKER_UNAVAILABLE", "No contact picker on this device", e))
      }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { activity, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      val uri = payload.data?.data
      if (payload.resultCode != PickedContact.RESULT_OK || uri == null) {
        promise.resolve(null)
        return@OnActivityResult
      }
      try {
        promise.resolve(readRow(activity.contentResolver, uri, payload.resultCode)?.toMap())
      } catch (e: SecurityException) {
        promise.reject(CodedException("ERR_PICKER_UNREADABLE", "The picked contact could not be read", e))
      }
    }
  }

  private fun readRow(
    resolver: android.content.ContentResolver,
    uri: Uri,
    resultCode: Int,
  ): PickedContact? =
    resolver.query(uri, PROJECTION, null, null, null)?.use { cursor ->
      val hasRow = cursor.moveToFirst()
      PickedContact.fromRow(
        resultCode = resultCode,
        hasRow = hasRow,
        displayName = if (hasRow) cursor.getString(0) else null,
        number = if (hasRow) cursor.getString(1) else null,
        normalizedNumber = if (hasRow) cursor.getString(2) else null,
      )
    }

  private companion object {
    const val REQUEST_CODE = 0x0C0A
    val PROJECTION = arrayOf(Phone.DISPLAY_NAME, Phone.NUMBER, Phone.NORMALIZED_NUMBER)
  }
}
