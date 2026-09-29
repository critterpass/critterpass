package app.critterpass.ocr

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import java.io.IOException
import kotlin.math.max

/** Loading a photo upright and deriving the grey signal image from it. */
object OcrImages {
  /** Photos are read at most this long on their longer side: small receipt print stays legible. */
  const val MAX_SOURCE_SIDE = 3000

  /** Decodes the image at `uri` downscaled to at most `MAX_SOURCE_SIDE`, EXIF rotation applied. */
  fun loadUpright(resolver: ContentResolver, uri: Uri): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    val longest = max(bounds.outWidth, bounds.outHeight)
    if (longest <= 0) throw IOException("Unreadable image")
    var sample = 1
    while (longest / (sample * 2) >= MAX_SOURCE_SIDE) sample *= 2
    val options =
      BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
    val decoded =
      resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
        ?: throw IOException("Unreadable image")
    val orientation =
      resolver.openInputStream(uri)?.use {
        ExifInterface(it)
          .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      } ?: ExifInterface.ORIENTATION_NORMAL
    val scale = MAX_SOURCE_SIDE.toFloat() / max(decoded.width, decoded.height)
    val matrix =
      Matrix().apply {
        when (orientation) {
          ExifInterface.ORIENTATION_ROTATE_90 -> postRotate(90f)
          ExifInterface.ORIENTATION_ROTATE_180 -> postRotate(180f)
          ExifInterface.ORIENTATION_ROTATE_270 -> postRotate(270f)
          ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> postScale(-1f, 1f)
          ExifInterface.ORIENTATION_FLIP_VERTICAL -> postScale(1f, -1f)
          ExifInterface.ORIENTATION_TRANSPOSE -> {
            postRotate(90f)
            postScale(-1f, 1f)
          }
          ExifInterface.ORIENTATION_TRANSVERSE -> {
            postRotate(270f)
            postScale(-1f, 1f)
          }
        }
        if (scale < 1f) postScale(scale, scale)
      }
    if (matrix.isIdentity && decoded.config == Bitmap.Config.ARGB_8888) return decoded
    val upright =
      Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true).let {
        if (it.config == Bitmap.Config.ARGB_8888) it else it.copy(Bitmap.Config.ARGB_8888, false)
      }
    if (upright !== decoded) decoded.recycle()
    return upright
  }

  /** The image downscaled to the signal size, as Rec. 601 grey levels. */
  fun grey(image: Bitmap): GreyImage {
    val (w, h) = OcrSignals.scaledSize(image.width, image.height)
    val small = Bitmap.createScaledBitmap(image, w, h, true)
    val argb = IntArray(w * h)
    small.getPixels(argb, 0, w, 0, 0, w, h)
    if (small !== image) small.recycle()
    return OcrSignals.grey(argb, w, h)
  }
}
