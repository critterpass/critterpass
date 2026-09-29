package app.critterpass.ocr

/**
 * Which ML Kit text recognizer reads a trip's language hints. Each hint arrives with its script
 * (modules/cp-ocr/src/scripts.ts). ML Kit v2 reads Latin, Chinese, Japanese, Korean and
 * Devanagari, and each non-Latin recognizer also reads Latin; any other script (Thai, Arabic,
 * Cyrillic…) cannot be read here, so the photo goes to the server for transcription.
 */
object OcrScripts {
  const val LATIN = "latin"
  val NON_LATIN = listOf("chinese", "japanese", "korean", "devanagari")

  /** The recognizer's script, or null when a hinted script has no recognizer on Android. */
  fun recognizerScript(scripts: List<String>): String? {
    if (scripts.any { it != LATIN && it !in NON_LATIN }) return null
    return scripts.firstOrNull { it in NON_LATIN } ?: LATIN
  }
}
