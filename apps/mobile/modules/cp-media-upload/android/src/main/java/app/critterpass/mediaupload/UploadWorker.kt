package app.critterpass.mediaupload

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sends one upload's unfinished parts. WorkManager runs it when the network is up, again after the
 * app or phone restarts, and retries transport failures with backoff; parts already done keep
 * their ETag in the store and are never sent twice. A 4xx answer (an expired presigned URL) fails
 * the part for the app to re-presign.
 */
class UploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val id = inputData.getString(KEY_ID) ?: return@withContext Result.failure()
    val store = MediaUploads.store(applicationContext)
    val job = store.job(id) ?: return@withContext Result.success()
    for (part in job.unfinishedParts) {
      if (part.state == UploadPart.FAILED) continue
      store.change(id) { it.withPart(part.partNumber) { p -> p.copy(state = UploadPart.UPLOADING, sentBytes = 0) } }
      val outcome = try {
        send(job, part) { sent ->
          val updated = store.change(id) { it.withPart(part.partNumber) { p -> p.copy(sentBytes = sent) } }
          if (updated != null) MediaUploads.emitProgress(updated)
        }
      } catch (error: IOException) {
        null
      }
      when {
        outcome == null || outcome.status >= 500 -> {
          store.change(id) { it.withPart(part.partNumber) { p -> p.copy(state = UploadPart.PENDING, sentBytes = 0) } }
          return@withContext if (runAttemptCount < MAX_ATTEMPTS) Result.retry() else fail(store, id, part, "network")
        }
        outcome.status !in 200..299 || outcome.etag == null ->
          return@withContext fail(store, id, part, "http_${outcome.status}")
        else -> {
          store.change(id) { it.markDone(part.partNumber, outcome.etag) }
          MediaUploads.emit("onUploadPartDone", mapOf("id" to id, "partNumber" to part.partNumber, "etag" to outcome.etag))
        }
      }
    }
    if (store.job(id)?.state == "done") MediaUploads.emit("onUploadFinished", mapOf("id" to id))
    Result.success()
  }

  private fun fail(store: UploadStore, id: String, part: UploadPart, reason: String): Result {
    store.change(id) { it.markFailed(part.partNumber, reason) }
    MediaUploads.emit("onUploadFailed", mapOf("id" to id, "partNumber" to part.partNumber, "reason" to reason))
    return Result.failure()
  }

  private class Outcome(val status: Int, val etag: String?)

  private fun send(job: UploadJob, part: UploadPart, onProgress: (Long) -> Unit): Outcome {
    val connection = URL(part.url).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "PUT"
      connection.doOutput = true
      connection.connectTimeout = 30_000
      connection.readTimeout = 60_000
      connection.setFixedLengthStreamingMode(part.length)
      if (job.parts.size == 1) connection.setRequestProperty("Content-Type", job.contentType)
      RandomAccessFile(File(job.filePath), "r").use { file ->
        file.seek(part.offset)
        connection.outputStream.use { out ->
          val buffer = ByteArray(CHUNK)
          var remaining = part.length
          var sent = 0L
          var reported = 0L
          while (remaining > 0) {
            val read = file.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
            if (read < 0) throw IOException("file ended before the part")
            out.write(buffer, 0, read)
            remaining -= read
            sent += read
            if (sent - reported >= REPORT_EVERY || remaining == 0L) {
              reported = sent
              onProgress(sent)
            }
          }
        }
      }
      return Outcome(connection.responseCode, connection.getHeaderField("ETag"))
    } finally {
      connection.disconnect()
    }
  }

  companion object {
    const val KEY_ID = "id"
    private const val MAX_ATTEMPTS = 8
    private const val CHUNK = 64 * 1024
    private const val REPORT_EVERY = 256L * 1024
  }
}
