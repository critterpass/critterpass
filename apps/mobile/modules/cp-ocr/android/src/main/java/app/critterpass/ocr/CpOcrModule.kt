package app.critterpass.ocr

import android.app.Activity
import android.content.Context
import android.content.IntentSender
import android.net.Uri
import com.google.android.gms.common.api.OptionalModuleApi
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate.InstallState
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizerOptionsInterface
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.japanese.JapaneseTextRecognizerOptions
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.max

/**
 * On-device receipt OCR for the JS layer (modules/cp-ocr/index.ts): `recognize` returns raw lines
 * and quality signals from ML Kit text recognition v2 (the JS side orders the lines and names the
 * problem), `scanBarcode` reads PDF417/Aztec/QR, `scanDocument` opens the ML Kit document scanner,
 * which finds the page and captures on its own. Everything runs in Google Play services. Async
 * functions run on Expo's background queue, so blocking on ML Kit tasks is fine there.
 */
class CpOcrModule : Module() {
  private var pendingScan: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("CpOcr")

    AsyncFunction("recognize") { uri: String, _: List<String>, scripts: List<String> ->
      val image = OcrImages.loadUpright(context.contentResolver, Uri.parse(uri))
      val width = image.width
      val height = image.height
      val grey = OcrImages.grey(image)
      val blur = OcrSignals.laplacianVariance(grey)
      val glare = OcrSignals.glareRatio(grey)
      val script = OcrScripts.recognizerScript(scripts)
      if (script == null) {
        image.recycle()
        return@AsyncFunction recognition(
          "unsupported_script", emptyList(), blur, glare, width, height)
      }
      val recognizer = TextRecognition.getClient(recognizerOptions(script))
      val text =
        try {
          ensureInstalled(recognizer)
          Tasks.await(recognizer.process(InputImage.fromBitmap(image, 0)))
        } finally {
          recognizer.close()
          image.recycle()
        }
      val lines = text.textBlocks.flatMap { it.lines }.mapNotNull { observe(it, width, height) }
      recognition("ok", lines, blur, glare, width, height)
    }

    AsyncFunction("scanBarcode") { uri: String ->
      val image = OcrImages.loadUpright(context.contentResolver, Uri.parse(uri))
      val options =
        BarcodeScannerOptions.Builder()
          .setBarcodeFormats(Barcode.FORMAT_PDF417, Barcode.FORMAT_AZTEC, Barcode.FORMAT_QR_CODE)
          .build()
      val scanner = BarcodeScanning.getClient(options)
      val found =
        try {
          ensureInstalled(scanner)
          Tasks.await(scanner.process(InputImage.fromBitmap(image, 0)))
        } finally {
          scanner.close()
          image.recycle()
        }
      found
        .mapNotNull { code ->
          val value = code.rawValue?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
          val format =
            when (code.format) {
              Barcode.FORMAT_PDF417 -> "pdf417"
              Barcode.FORMAT_AZTEC -> "aztec"
              Barcode.FORMAT_QR_CODE -> "qr"
              else -> return@mapNotNull null
            }
          mapOf("format" to format, "value" to value)
        }
        .distinct()
    }

    AsyncFunction("scanDocument") { pageLimit: Int, promise: Promise ->
      if (pendingScan != null) {
        promise.reject(
          CodedException("ERR_SCANNER_BUSY", "The document scanner is already open", null))
        return@AsyncFunction
      }
      val activity = appContext.throwingActivity
      val options =
        GmsDocumentScannerOptions.Builder()
          .setGalleryImportAllowed(false)
          .setPageLimit(max(1, pageLimit))
          .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
          .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
          .build()
      pendingScan = promise
      GmsDocumentScanning.getClient(options)
        .getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          try {
            activity.startIntentSenderForResult(sender, REQUEST_CODE, null, 0, 0, 0)
          } catch (e: IntentSender.SendIntentException) {
            failScan(e)
          }
        }
        .addOnFailureListener { e -> failScan(e) }
    }.runOnQueue(Queues.MAIN)

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pendingScan ?: return@OnActivityResult
      pendingScan = null
      val pages =
        if (payload.resultCode == Activity.RESULT_OK) {
          GmsDocumentScanningResult.fromActivityResultIntent(payload.data)?.pages.orEmpty()
        } else {
          emptyList()
        }
      val uris = pages.map { it.imageUri.toString() }
      promise.resolve(
        if (uris.isEmpty()) mapOf("status" to "cancelled")
        else mapOf("status" to "captured", "uris" to uris))
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  private fun failScan(error: Exception) {
    val promise = pendingScan ?: return
    pendingScan = null
    promise.reject(
      CodedException("ERR_SCANNER_UNAVAILABLE", "The document scanner could not open", error))
  }

  private fun recognizerOptions(script: String): TextRecognizerOptionsInterface =
    when (script) {
      "chinese" -> ChineseTextRecognizerOptions.Builder().build()
      "japanese" -> JapaneseTextRecognizerOptions.Builder().build()
      "korean" -> KoreanTextRecognizerOptions.Builder().build()
      "devanagari" -> DevanagariTextRecognizerOptions.Builder().build()
      else -> TextRecognizerOptions.DEFAULT_OPTIONS
    }

  /** Waits for Google Play services to fetch the model behind `api` the first time it is used. */
  private fun ensureInstalled(api: OptionalModuleApi) {
    val client = ModuleInstall.getClient(context)
    if (Tasks.await(client.areModulesAvailable(api)).areModulesAvailable()) return
    val done = CountDownLatch(1)
    val listener = InstallStatusListener { update ->
      val state = update.installState
      if (state in FINISHED_INSTALL_STATES) done.countDown()
    }
    try {
      val request = ModuleInstallRequest.newBuilder().addApi(api).setListener(listener).build()
      if (!Tasks.await(client.installModules(request)).areModulesAlreadyInstalled()) {
        done.await(MODEL_INSTALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
      }
    } finally {
      client.unregisterListener(listener)
    }
  }

  private data class ObservedLine(
    val text: String,
    val box: LineBox,
    val conf: Double,
    val baseline: Baseline,
  )

  /** A line with its box normalised to the image and its baseline (bottom corners) in pixels. */
  private fun observe(line: Text.Line, width: Int, height: Int): ObservedLine? {
    val box = line.boundingBox ?: return null
    val corners = line.cornerPoints
    val baseline =
      if (corners != null && corners.size == 4) {
        // Corners run clockwise from the top-left: the baseline is bottom-left → bottom-right.
        Baseline(
          corners[3].x.toDouble(), corners[3].y.toDouble(),
          corners[2].x.toDouble(), corners[2].y.toDouble())
      } else {
        Baseline(
          box.left.toDouble(), box.bottom.toDouble(), box.right.toDouble(), box.bottom.toDouble())
      }
    return ObservedLine(
      text = line.text,
      box =
        LineBox(
          box.left.toDouble() / width, box.top.toDouble() / height,
          box.width().toDouble() / width, box.height().toDouble() / height),
      conf = line.confidence.toDouble(),
      baseline = baseline,
    )
  }

  private fun recognition(
    status: String,
    lines: List<ObservedLine>,
    blur: Double,
    glare: Double,
    width: Int,
    height: Int,
  ): Map<String, Any> =
    mapOf(
      "status" to status,
      "observations" to
        lines.map {
          mapOf(
            "text" to it.text,
            "bbox" to listOf(it.box.x, it.box.y, it.box.w, it.box.h),
            "conf" to it.conf,
          )
        },
      "signals" to
        mapOf(
          "blur" to blur,
          "glare" to glare,
          "curvature" to OcrSignals.curvature(lines.map { it.baseline }, width.toDouble()),
          "clipped" to OcrSignals.clippedShare(lines.map { it.box }),
        ),
      "width" to width,
      "height" to height,
    )

  private companion object {
    const val REQUEST_CODE = 0x0C0B
    const val MODEL_INSTALL_TIMEOUT_SECONDS = 60L
    val FINISHED_INSTALL_STATES =
      setOf(InstallState.STATE_COMPLETED, InstallState.STATE_FAILED, InstallState.STATE_CANCELED)
  }
}
