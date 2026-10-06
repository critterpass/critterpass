package app.critterpass.mediaupload

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

class PartRecord : Record {
  @Field var partNumber: Int = 1
  @Field var url: String = ""
  @Field var offset: Double = 0.0
  @Field var length: Double = 0.0
}

class EnqueueRecord : Record {
  @Field var id: String = ""
  @Field var filePath: String = ""
  @Field var contentType: String = "image/jpeg"
  @Field var parts: List<PartRecord> = emptyList()
}

/**
 * Background photo uploads on WorkManager. JS prepares a photo (location removed), presigns its
 * parts, queues them here, and completes the upload on the server once every part reports its
 * ETag, also after a restart, from `getUploads()`.
 */
class CpMediaUploadModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("CpMediaUpload")

    Events("onUploadProgress", "onUploadPartDone", "onUploadFailed", "onUploadFinished")

    OnStartObserving {
      MediaUploads.listener = { name, body -> sendEvent(name, body) }
    }

    OnStopObserving {
      MediaUploads.listener = null
    }

    AsyncFunction("preparePhoto") { uri: String, id: String ->
      val photo = PhotoPreparer.prepare(context, uri, id)
      mapOf(
        "path" to photo.path,
        "sha256" to photo.sha256,
        "bytes" to photo.bytes,
        "width" to photo.width,
        "height" to photo.height,
        "takenAt" to photo.takenAt,
        "gpsStripped" to photo.gpsStripped,
      ).filterValues { it != null }
    }

    AsyncFunction("enqueue") { request: EnqueueRecord ->
      val job = UploadJob(
        id = request.id,
        filePath = request.filePath,
        contentType = request.contentType,
        parts = request.parts.map { UploadPart(it.partNumber, it.url, it.offset.toLong(), it.length.toLong()) },
      )
      MediaUploads.store(context).put(job)
      MediaUploads.schedule(context, job.id)
    }

    AsyncFunction("retry") { id: String, urls: Map<String, String> ->
      val fresh = urls.mapNotNull { (key, url) -> key.toIntOrNull()?.let { it to url } }.toMap()
      if (MediaUploads.store(context).change(id) { it.retry(fresh) } != null) {
        MediaUploads.schedule(context, id)
      }
    }

    AsyncFunction("getUploads") {
      MediaUploads.store(context).all().map { describe(it) }
    }

    AsyncFunction("cancel") { id: String ->
      MediaUploads.cancel(context, id)
      MediaUploads.store(context).remove(id)
    }

    AsyncFunction("finish") { id: String ->
      val store = MediaUploads.store(context)
      store.job(id)?.let { File(it.filePath).delete() }
      store.remove(id)
    }
  }

  private fun describe(job: UploadJob): Map<String, Any?> = mapOf(
    "id" to job.id,
    "state" to job.state,
    "filePath" to job.filePath,
    "sentBytes" to job.sentBytes,
    "totalBytes" to job.totalBytes,
    "failure" to job.failure,
    "parts" to job.parts.map { part ->
      mapOf("partNumber" to part.partNumber, "state" to part.state, "etag" to part.etag).filterValues { it != null }
    },
  ).filterValues { it != null }
}
