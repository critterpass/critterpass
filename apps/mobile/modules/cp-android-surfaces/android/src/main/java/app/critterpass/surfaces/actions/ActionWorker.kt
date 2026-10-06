package app.critterpass.surfaces.actions

import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.critterpass.appgroup.AppGroupStore
import app.critterpass.surfaces.R
import app.critterpass.notifications.R as NotificationsR
import java.net.HttpURLConnection
import java.net.URL
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Drains the shared outbox through `POST /v1/actions`, signed with the Keystore action key. Runs
 * as expedited work the moment a surface queues something and the network is up; WorkManager keeps
 * it until connectivity returns. Entries the key cannot send (scope, expiry) stay for the app's
 * own drain, which uses the session instead.
 */
class ActionWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val store = PendingActions.store(applicationContext)
    val keys = ActionKeyStore(applicationContext)
    val meta = keys.meta() ?: return@withContext Result.success()
    val mac = keys.mac() ?: return@withContext Result.success()
    val baseUrl = apiBaseUrl(store) ?: return@withContext Result.success()
    val actions = JSONObject(store.pendingActionsText()).optJSONArray("actions") ?: return@withContext Result.success()
    val done = mutableSetOf<String>()
    var retry = false
    val now = System.currentTimeMillis()
    for (index in 0 until actions.length()) {
      val entry = actions.optJSONObject(index) ?: continue
      val opId = entry.optString("op_id", "")
      if (opId.isEmpty() || !meta.allows(entry.optString("scope", ""), now)) continue
      val body = ActionEnvelope.build(entry, meta, appVersion(), TimeZone.getDefault().id)
      val headers = ActionSigner.sign(mac, meta.keyId, "POST", ActionEnvelope.PATH, body, System.currentTimeMillis())
      val (status, answer) = post(baseUrl, body, headers)
      when (ActionEnvelope.classify(status, answer)) {
        ActionOutcome.SENT, ActionOutcome.REJECTED -> done += opId
        ActionOutcome.RETRY -> retry = true
        ActionOutcome.LEAVE_FOR_APP -> Unit
      }
    }
    if (done.isNotEmpty()) store.removePendingActions(done)
    if (retry) Result.retry() else Result.success()
  }

  /** Below Android 12 expedited work runs as a short foreground service, which needs a notification. */
  override suspend fun getForegroundInfo(): ForegroundInfo {
    val notification = NotificationCompat.Builder(applicationContext, FOREGROUND_CHANNEL)
      .setSmallIcon(NotificationsR.drawable.cp_notification_icon)
      .setContentTitle(applicationContext.getString(R.string.cp_surfaces_sending))
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    return ForegroundInfo(FOREGROUND_ID, notification)
  }

  private fun apiBaseUrl(store: AppGroupStore): String? {
    val raw = store.read(AppGroupStore.ENDPOINTS_PATH) ?: return null
    return runCatching { JSONObject(String(raw, Charsets.UTF_8)).getString("api_base_url").trimEnd('/') }.getOrNull()
  }

  private fun appVersion(): String = runCatching {
    applicationContext.packageManager.getPackageInfo(applicationContext.packageName, 0).versionName
  }.getOrNull() ?: "0.0.0"

  private fun post(baseUrl: String, body: ByteArray, headers: SignedHeaders): Pair<Int?, String?> = runCatching {
    val connection = URL(baseUrl + ActionEnvelope.PATH).openConnection() as HttpURLConnection
    try {
      connection.requestMethod = "POST"
      connection.connectTimeout = TIMEOUT_MS
      connection.readTimeout = TIMEOUT_MS
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("X-CP-Key-Id", headers.keyId)
      connection.setRequestProperty("X-CP-Ts", headers.timestamp)
      connection.setRequestProperty("X-CP-Sig", headers.signature)
      connection.outputStream.use { it.write(body) }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      status to stream?.bufferedReader()?.use { it.readText() }
    } finally {
      connection.disconnect()
    }
  }.getOrElse { null to null }

  companion object {
    private const val WORK_NAME = "cp-surfaces-actions"
    private const val FOREGROUND_CHANNEL = "cp_trip"
    private const val FOREGROUND_ID = 7301
    private const val TIMEOUT_MS = 15_000

    /**
     * Sends whatever is queued as soon as the network allows. A newer request replaces a pending or
     * running drain: each run reads the whole outbox, and `op_id` makes a repeated send harmless.
     */
    fun schedule(context: Context) {
      val request = OneTimeWorkRequestBuilder<ActionWorker>()
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .build()
      WorkManager.getInstance(context.applicationContext)
        .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }
  }
}
