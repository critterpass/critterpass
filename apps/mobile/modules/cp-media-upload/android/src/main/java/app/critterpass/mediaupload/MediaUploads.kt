package app.critterpass.mediaupload

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.io.File
import java.util.concurrent.TimeUnit

/** The process-wide store, the work queue and the event hook the module listens on. */
object MediaUploads {
  @Volatile private var store: UploadStore? = null
  @Volatile var listener: ((String, Map<String, Any?>) -> Unit)? = null

  fun store(context: Context): UploadStore =
    store ?: synchronized(this) {
      store ?: UploadStore(File(context.filesDir, "media-upload/uploads.json")).also { store = it }
    }

  fun schedule(context: Context, id: String) {
    val request = OneTimeWorkRequestBuilder<UploadWorker>()
      .setInputData(workDataOf(UploadWorker.KEY_ID to id))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
      .addTag(TAG)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(workName(id), ExistingWorkPolicy.REPLACE, request)
  }

  fun cancel(context: Context, id: String) {
    WorkManager.getInstance(context).cancelUniqueWork(workName(id))
  }

  fun emit(name: String, body: Map<String, Any?>) {
    listener?.invoke(name, body)
  }

  fun emitProgress(job: UploadJob) =
    emit("onUploadProgress", mapOf("id" to job.id, "sentBytes" to job.sentBytes, "totalBytes" to job.totalBytes))

  private fun workName(id: String) = "media-upload-$id"
  private const val TAG = "cp-media-upload"
}
