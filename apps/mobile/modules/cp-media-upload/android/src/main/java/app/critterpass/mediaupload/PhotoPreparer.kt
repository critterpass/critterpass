package app.critterpass.mediaupload

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.File
import java.security.MessageDigest

/** What the album registers about a prepared photo. */
data class PreparedPhoto(
  val path: String,
  val sha256: String,
  val bytes: Long,
  val width: Int?,
  val height: Int?,
  val takenAt: String?,
  val gpsStripped: Boolean,
)

/**
 * Copies a picked photo into the app's files and removes its location before it leaves the phone:
 * every GPS tag is cleared and the rest of the EXIF (orientation, capture time) is kept. A format
 * ExifInterface cannot rewrite (HEIF) is re-encoded as JPEG with its rotation applied. The SHA-256
 * is of the stripped file, the bytes the server stores.
 */
object PhotoPreparer {
  private val gpsTags: List<String> by lazy {
    ExifInterface::class.java.fields
      .filter { it.name.startsWith("TAG_GPS_") && it.type == String::class.java }
      .mapNotNull { it.get(null) as? String }
  }

  fun prepare(context: Context, uri: String, id: String): PreparedPhoto {
    val directory = File(context.filesDir, "media-upload/files").apply { mkdirs() }
    val source = Uri.parse(uri)
    val extension = (source.lastPathSegment?.substringAfterLast('.', "") ?: "").lowercase()
    val rewritable = extension in setOf("jpg", "jpeg", "png", "webp")
    val output = File(directory, "$id.${if (rewritable) extension else "jpg"}")
    val input = if (source.scheme == null || source.scheme == "file") File(source.path ?: uri).inputStream()
    else context.contentResolver.openInputStream(source) ?: error("cannot open $uri")
    val copy = File(directory, "$id.source")
    input.use { stream -> copy.outputStream().use { stream.copyTo(it) } }

    val original = ExifInterface(copy.absolutePath)
    val takenAt = original.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
    if (rewritable) {
      copy.renameTo(output)
      val exif = ExifInterface(output.absolutePath)
      for (tag in gpsTags) exif.setAttribute(tag, null)
      exif.saveAttributes()
    } else {
      reencode(copy, output, original.rotationDegrees)
      copy.delete()
    }

    val stripped = ExifInterface(output.absolutePath)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(output.absolutePath, bounds)
    return PreparedPhoto(
      path = output.absolutePath,
      sha256 = sha256(output),
      bytes = output.length(),
      width = bounds.outWidth.takeIf { it > 0 },
      height = bounds.outHeight.takeIf { it > 0 },
      takenAt = takenAt,
      gpsStripped = stripped.latLong == null,
    )
  }

  private fun reencode(source: File, output: File, rotation: Int) {
    val bitmap = BitmapFactory.decodeFile(source.absolutePath) ?: error("cannot decode ${source.name}")
    val upright = if (rotation == 0) bitmap
    else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
    output.outputStream().use { upright.compress(Bitmap.CompressFormat.JPEG, 92, it) }
  }

  fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { stream ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val read = stream.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }
}
