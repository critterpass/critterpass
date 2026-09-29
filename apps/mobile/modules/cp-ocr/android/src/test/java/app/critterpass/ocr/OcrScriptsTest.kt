package app.critterpass.ocr

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OcrScriptsTest {
  @Test
  fun latinWithoutHints() {
    assertEquals("latin", OcrScripts.recognizerScript(emptyList()))
    assertEquals("latin", OcrScripts.recognizerScript(listOf("latin", "latin")))
  }

  @Test
  fun theFirstNonLatinScriptPicksTheRecognizer() {
    assertEquals("japanese", OcrScripts.recognizerScript(listOf("latin", "japanese", "korean")))
    assertEquals("devanagari", OcrScripts.recognizerScript(listOf("devanagari")))
    assertEquals("chinese", OcrScripts.recognizerScript(listOf("chinese", "latin")))
  }

  @Test
  fun thaiOrAnyUnreadableScriptHasNoRecognizer() {
    assertNull(OcrScripts.recognizerScript(listOf("thai")))
    assertNull(OcrScripts.recognizerScript(listOf("latin", "thai")))
    assertNull(OcrScripts.recognizerScript(listOf("japanese", "cyrillic")))
  }
}
