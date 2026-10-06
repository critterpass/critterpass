package app.critterpass.surfaces.actions

import org.json.JSONObject

/**
 * One button under a notification. A background action runs [command] through the outbox with
 * the action key's [scope]; a foreground one opens the app on the push's route.
 */
data class SurfaceAction(
  val id: String,
  val foreground: Boolean,
  val command: String? = null,
  val scope: String? = null,
  val payload: Map<String, Any> = emptyMap(),
  /** A reply field: the typed text becomes the payload's [replyKey]. */
  val replyKey: String? = null,
  /** Option label for vote buttons (`VOTE_n`); other buttons use their localised id label. */
  val label: String? = null,
)

/**
 * The notification categories' actions on Android (docs/api-contracts-async.md §3.4, the table in
 * packages/domain/src/surfaces/notification-categories.ts), with each background action's payload
 * built from the push's `cp.ctx`. A button whose payload cannot be built from the context, or whose
 * command has no action-key scope (it only runs on the app's session), is left out rather than
 * shown and failing. Pure: org.json only.
 */
object Categories {
  const val VOTE_ACTIONS = 3

  private val open = SurfaceAction("OPEN", foreground = true)

  fun actions(category: String?, ctx: JSONObject?): List<SurfaceAction> {
    val c = ctx ?: JSONObject()
    val list = when (category) {
      "cp.vote" -> vote(c) + open
      "cp.changeset" -> c.id("change_set_id")?.let { id ->
        listOf(
          bg("APPROVE", "approve_changeset", "changeset", "changeset_id" to id, "decision" to "yes"),
          bg("DECLINE", "approve_changeset", "changeset", "changeset_id" to id, "decision" to "no"),
        )
      }.orEmpty()
      "cp.disruption" -> listOfNotNull(
        both(c.id("disruption_id"), c.id("action_id")) { d, a ->
          bg("APPROVE", "decide_disruption_action", "ballot", "disruption_id" to d, "action_id" to a, "decision" to "yes")
        },
        open,
      )
      "cp.leaveby" -> c.id("leave_by_id")?.let { id ->
        listOf(
          bg("IM_UP", "set_readiness", "readiness", "leave_by_id" to id, "state" to "up", "source" to "notification"),
          bg("SNOOZE", "snooze_leave_by", "readiness", "leave_by_id" to id),
        )
      }.orEmpty()
      "cp.sos" -> listOfNotNull(
        c.id("sos_id")?.let { bg("COMING", "respond_sos", "sos", "sos_id" to it, "state" to "coming") },
        open,
      )
      "cp.money" -> c.id("payment_id")?.let { id ->
        listOf(bg("CONFIRM", "confirm_paid", "money_mark", "payment_id" to id), bg("NUDGE", "nudge_payment", "money_nudge", "payment_id" to id))
      }.orEmpty()
      "cp.chat" -> c.id("crew_id")?.let { crew ->
        listOfNotNull(
          SurfaceAction("REPLY", false, "send_message", "chat_reply", mapOf("crew_id" to crew), replyKey = "body"),
          c.optLong("seq", -1).takeIf { it >= 0 }?.let { bg("READ", "mark_read", "chat_reply", "crew_id" to crew, "seq" to it) },
        )
      }.orEmpty()
      "cp.rsvp" -> listOfNotNull(
        c.id("proposal_id")?.let { bg("IN", "set_rsvp", "rsvp", "proposal_id" to it, "status" to "in") },
        c.id("proposal_id")?.let { bg("MAYBE", "set_rsvp", "rsvp", "proposal_id" to it, "status" to "maybe") },
        open,
      )
      "cp.invite" -> listOf(SurfaceAction("JOIN", foreground = true))
      "cp.help" -> c.id("share_id")?.let { listOf(bg("STOP_SHARE", "stop_help_share", "sos", "share_id" to it)) }.orEmpty()
      "cp.setup_ask" -> listOf(SurfaceAction("freed", foreground = true), SurfaceAction("not_movable", foreground = true))
      else -> listOf(open)
    }
    return list.take(MAX_BUTTONS)
  }

  /** `VOTE_1..3` → `cast_ballot{poll_id, option_id}` with the option's own label. */
  private fun vote(ctx: JSONObject): List<SurfaceAction> {
    val pollId = ctx.id("poll_id") ?: return emptyList()
    val options = ctx.optJSONArray("options") ?: return emptyList()
    return (0 until minOf(options.length(), VOTE_ACTIONS)).mapNotNull { index ->
      val option = options.optJSONObject(index) ?: return@mapNotNull null
      val optionId = option.id("id") ?: return@mapNotNull null
      SurfaceAction(
        id = "VOTE_${index + 1}",
        foreground = false,
        command = "cast_ballot",
        scope = "ballot",
        payload = mapOf("poll_id" to pollId, "option_id" to optionId),
        label = option.optString("label").takeIf { it.isNotBlank() },
      )
    }
  }

  /** Android shows three buttons at most. */
  const val MAX_BUTTONS = 3

  private fun bg(id: String, command: String, scope: String, vararg payload: Pair<String, Any>) =
    SurfaceAction(id, foreground = false, command = command, scope = scope, payload = mapOf(*payload))

  private fun <T> both(a: String?, b: String?, make: (String, String) -> T): T? =
    if (a != null && b != null) make(a, b) else null

  private fun JSONObject.id(key: String): String? =
    if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
}
