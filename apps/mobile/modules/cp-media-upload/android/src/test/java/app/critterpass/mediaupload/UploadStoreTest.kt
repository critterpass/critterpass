package app.critterpass.mediaupload

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.file.Files

class UploadStoreTest {
  private fun job() = UploadJob(
    id = "p1",
    filePath = "/data/p1.jpg",
    contentType = "image/jpeg",
    parts = listOf(
      UploadPart(1, "https://r2/1", 0, 10),
      UploadPart(2, "https://r2/2", 10, 5),
    ),
  )

  @Test
  fun aKilledUploadResumesOnlyItsUnfinishedParts() {
    val file = Files.createTempDirectory("uploads").resolve("uploads.json").toFile()
    UploadStore(file).apply {
      put(job())
      change("p1") { it.markDone(1, "\"e1\"") }
      change("p1") { it.withPart(2) { part -> part.copy(state = UploadPart.UPLOADING, sentBytes = 3) } }
    }

    // A new process reads the same file and the worker restarts.
    val relaunched = UploadStore(file).job("p1")!!
    assertEquals(listOf(2), relaunched.unfinishedParts.map { it.partNumber })
    assertEquals("\"e1\"", relaunched.parts.first().etag)
    assertEquals(13L, relaunched.sentBytes)
  }

  @Test
  fun failedPartsRetryWithFreshUrls() {
    val failed = job().markDone(1, "a").markFailed(2, "http_403")
    assertEquals("failed", failed.state)
    val retried = failed.retry(mapOf(2 to "https://r2/2-fresh"))
    assertEquals("uploading", retried.state)
    assertEquals("https://r2/2-fresh", retried.parts[1].url)
    assertEquals("a", retried.parts[0].etag)
    assertNull(retried.failure)
  }

  @Test
  fun doneOnlyWhenEveryPartHasItsEtag() {
    val done = job().markDone(1, "a").markDone(2, "b")
    assertEquals("done", done.state)
    assertEquals(done.totalBytes, done.sentBytes)
  }

  @Test
  fun removeForgetsTheJob() {
    val file = Files.createTempDirectory("uploads").resolve("uploads.json").toFile()
    val store = UploadStore(file)
    store.put(job())
    store.remove("p1")
    assertTrue(store.all().isEmpty())
  }
}
