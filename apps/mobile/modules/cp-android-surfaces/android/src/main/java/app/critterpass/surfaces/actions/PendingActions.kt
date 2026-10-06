package app.critterpass.surfaces.actions

import android.content.Context
import app.critterpass.appgroup.AppGroupStore
import app.critterpass.appgroup.PendingAction
import app.critterpass.appgroup.PendingActionScope
import app.critterpass.appgroup.PendingActionVia
import java.time.Instant

/**
 * Every tap on an Android surface (notification action, widget, Live Update button) goes through
 * here: the command is written to the shared outbox (`state/pending-actions.json`, the same file
 * iOS extensions queue into and the app drains on launch) and the expedited [ActionWorker] is asked
 * to send it now. Offline, the entry simply waits; the worker drains it once connectivity returns,
 * or the app does on its next launch. The `op_id` is minted here, so a send repeated by either
 * drain is answered as a duplicate.
 */
object PendingActions {
  fun enqueue(
    context: Context,
    cmd: String,
    scope: PendingActionScope,
    via: PendingActionVia,
    payload: Map<String, Any>,
  ): String {
    val now = System.currentTimeMillis()
    val opId = ActionSigner.uuidV7(now)
    store(context).appendPendingAction(
      PendingAction(
        opId = opId,
        cmd = cmd,
        v = PendingAction.V_VALUE,
        via = via,
        scope = scope,
        clientTs = Instant.ofEpochMilli(now).toString(),
        payload = payload,
      ),
    )
    ActionWorker.schedule(context)
    return opId
  }

  fun store(context: Context): AppGroupStore = AppGroupStore.inFilesDir(context.applicationContext.filesDir)
}
