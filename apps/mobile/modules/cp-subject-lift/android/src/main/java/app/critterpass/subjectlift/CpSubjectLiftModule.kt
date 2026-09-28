package app.critterpass.subjectlift

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.UUID
import kotlin.math.max

/**
 * The photo-avatar lift for the JS pipeline (src/features/onboarding/photo): `lift` turns a photo
 * into a cut-out PNG with alpha cropped to the subject (ML Kit subject segmentation, running in
 * Google Play services), `prepare` lays the square avatar PNG that gets uploaded. The pixel work
 * lives in `CutoutMath` (JVM-tested). Async functions run on Expo's background queue, so blocking
 * on the segmenter task is fine here.
 */
class CpSubjectLiftModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CpSubjectLift")

    Function("isSupported") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) ==
        ConnectionResult.SUCCESS
    }

    AsyncFunction("lift") { uri: String ->
      val photo = loadUpright(Uri.parse(uri))
      val width = photo.width
      val height = photo.height
      val options = SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build()
      val segmenter = SubjectSegmentation.getClient(options)
      val result =
        try {
          Tasks.await(segmenter.process(InputImage.fromBitmap(photo, 0)))
        } finally {
          segmenter.close()
        }
      val buffer = result.foregroundConfidenceMask ?: return@AsyncFunction mapOf("found" to false)
      val mask = FloatArray(width * height)
      buffer.rewind()
      buffer.get(mask)
      val bounds =
        CutoutMath.subjectBounds(mask, width, height)
          ?: return@AsyncFunction mapOf("found" to false)
      val pixels = IntArray(width * height)
      photo.getPixels(pixels, 0, width, 0, 0, width, height)
      photo.recycle()
      val cut = CutoutMath.crop(CutoutMath.maskToAlpha(pixels, mask), width, bounds)
      val cutout = Bitmap.createBitmap(bounds.width, bounds.height, Bitmap.Config.ARGB_8888)
      cutout.setPixels(cut, 0, bounds.width, 0, 0, bounds.width, bounds.height)
      val file = writePng(encodePng(cutout))
      cutout.recycle()
      mapOf(
        "found" to true,
        "uri" to Uri.fromFile(file).toString(),
        "width" to bounds.width,
        "height" to bounds.height,
      )
    }

    AsyncFunction("prepare") { uri: String, cutout: Boolean, zoom: Double, size: Int ->
      val image = loadUpright(Uri.parse(uri))
      val avatar = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val at =
        CutoutMath.placement(
          image.width.toDouble(), image.height.toDouble(), cutout, zoom, size.toDouble())
      Canvas(avatar)
        .drawBitmap(
          image,
          null,
          RectF(
            at.left.toFloat(),
            at.top.toFloat(),
            (at.left + at.width).toFloat(),
            (at.top + at.height).toFloat()),
          Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
      image.recycle()
      if (!cutout) {
        val pixels = IntArray(size * size)
        avatar.getPixels(pixels, 0, size, 0, 0, size, size)
        CutoutMath.clipToCircle(pixels, size)
        avatar.setPixels(pixels, 0, size, 0, 0, size, size)
      }
      val png = encodePng(avatar)
      avatar.recycle()
      val file = writePng(png)
      mapOf(
        "uri" to Uri.fromFile(file).toString(),
        "sha256" to CutoutMath.hex(MessageDigest.getInstance("SHA-256").digest(png)),
        "byteLength" to png.size,
      )
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  /** Decodes the photo downscaled to at most `MAX_SOURCE_SIDE`, with its EXIF rotation applied. */
  private fun loadUpright(uri: Uri): Bitmap {
    val resolver = context.contentResolver
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
      Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        .let { if (it.config == Bitmap.Config.ARGB_8888) it else it.copy(Bitmap.Config.ARGB_8888, false) }
    if (upright !== decoded) decoded.recycle()
    return upright
  }

  private fun encodePng(bitmap: Bitmap): ByteArray =
    java.io.ByteArrayOutputStream().use { out ->
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      out.toByteArray()
    }

  private fun writePng(bytes: ByteArray): File {
    val dir = File(context.cacheDir, "cp-subject-lift").apply { mkdirs() }
    return File(dir, "${UUID.randomUUID()}.png").apply { writeBytes(bytes) }
  }

  private companion object {
    const val MAX_SOURCE_SIDE = 1600
  }
}
