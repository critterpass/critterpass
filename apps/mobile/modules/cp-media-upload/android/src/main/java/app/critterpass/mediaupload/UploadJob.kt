package app.critterpass.mediaupload

import org.json.JSONArray
import org.json.JSONObject

/** One presigned PUT of a byte range of the file (a whole small file is one part at offset 0). */
data class UploadPart(
  val partNumber: Int,
  val url: String,
  val offset: Long,
  val length: Long,
  val etag: String? = null,
  val state: String = PENDING,
  val sentBytes: Long = 0,
) {
  companion object {
    const val PENDING = "pending"
    const val UPLOADING = "uploading"
    const val DONE = "done"
    const val FAILED = "failed"
  }
}

/** An upload the app queued: every part must land before the app completes it on the server. */
data class UploadJob(
  val id: String,
  val filePath: String,
  val contentType: String,
  val parts: List<UploadPart>,
  val failure: String? = null,
) {
  val state: String
    get() = when {
      parts.all { it.state == UploadPart.DONE } -> "done"
      parts.any { it.state == UploadPart.FAILED } -> "failed"
      else -> "uploading"
    }

  val totalBytes: Long get() = parts.sumOf { it.length }
  val sentBytes: Long get() = parts.sumOf { if (it.state == UploadPart.DONE) it.length else it.sentBytes }

  /** Parts without a result yet: what a (re)started worker must send. */
  val unfinishedParts: List<UploadPart> get() = parts.filter { it.state != UploadPart.DONE }

  fun withPart(number: Int, change: (UploadPart) -> UploadPart): UploadJob =
    copy(parts = parts.map { if (it.partNumber == number) change(it) else it })

  fun markDone(number: Int, etag: String): UploadJob =
    withPart(number) { it.copy(state = UploadPart.DONE, etag = etag, sentBytes = it.length) }

  fun markFailed(number: Int, reason: String): UploadJob =
    withPart(number) { it.copy(state = UploadPart.FAILED) }.copy(failure = reason)

  /** Failed parts go back to pending, with fresh URLs when the app re-presigned them. */
  fun retry(urls: Map<Int, String>): UploadJob = copy(
    parts = parts.map { part ->
      if (part.state == UploadPart.DONE) part
      else part.copy(url = urls[part.partNumber] ?: part.url, state = UploadPart.PENDING, etag = null, sentBytes = 0)
    },
    failure = null,
  )

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("filePath", filePath)
    .put("contentType", contentType)
    .put("failure", failure ?: JSONObject.NULL)
    .put(
      "parts",
      JSONArray(parts.map { part ->
        JSONObject()
          .put("partNumber", part.partNumber)
          .put("url", part.url)
          .put("offset", part.offset)
          .put("length", part.length)
          .put("etag", part.etag ?: JSONObject.NULL)
          .put("state", part.state)
          .put("sentBytes", part.sentBytes)
      }),
    )

  companion object {
    fun fromJson(json: JSONObject): UploadJob {
      val parts = json.getJSONArray("parts")
      return UploadJob(
        id = json.getString("id"),
        filePath = json.getString("filePath"),
        contentType = json.getString("contentType"),
        failure = json.optString("failure").takeUnless { json.isNull("failure") || it.isEmpty() },
        parts = (0 until parts.length()).map { index ->
          val part = parts.getJSONObject(index)
          UploadPart(
            partNumber = part.getInt("partNumber"),
            url = part.getString("url"),
            offset = part.getLong("offset"),
            length = part.getLong("length"),
            etag = part.optString("etag").takeUnless { part.isNull("etag") || it.isEmpty() },
            state = part.getString("state"),
            sentBytes = part.optLong("sentBytes", 0),
          )
        },
      )
    }
  }
}
