package app.critterpass.mediaupload

import org.json.JSONArray
import java.io.File

/**
 * The queued uploads, kept in a JSON file so a worker that runs after the app was closed still
 * finds its job. Every change is written to a temporary file and renamed over the old one.
 */
class UploadStore(private val file: File) {
  @Synchronized
  fun all(): List<UploadJob> {
    if (!file.exists()) return emptyList()
    return runCatching {
      val array = JSONArray(file.readText())
      (0 until array.length()).map { UploadJob.fromJson(array.getJSONObject(it)) }
    }.getOrDefault(emptyList())
  }

  fun job(id: String): UploadJob? = all().firstOrNull { it.id == id }

  @Synchronized
  fun put(job: UploadJob) = write(all().filter { it.id != job.id } + job)

  @Synchronized
  fun change(id: String, change: (UploadJob) -> UploadJob): UploadJob? {
    val jobs = all()
    val current = jobs.firstOrNull { it.id == id } ?: return null
    val changed = change(current)
    write(jobs.map { if (it.id == id) changed else it })
    return changed
  }

  @Synchronized
  fun remove(id: String) = write(all().filter { it.id != id })

  private fun write(jobs: List<UploadJob>) {
    file.parentFile?.mkdirs()
    val temp = File(file.parentFile, "${file.name}.tmp")
    temp.writeText(JSONArray(jobs.map { it.toJson() }).toString())
    if (!temp.renameTo(file)) {
      file.delete()
      temp.renameTo(file)
    }
  }
}
