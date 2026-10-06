package app.critterpass.surfaces.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.width
import androidx.compose.ui.unit.dp
import app.critterpass.surfaces.R
import app.critterpass.surfaces.SnapshotStore
import java.text.DateFormat
import java.util.Date

/**
 * One Glance widget per snapshot section (5c-1/5c-2). Each reads `snapshot/widgets.json` when it
 * is drawn, so `widget.refresh` and the app's reload broadcast only need to call `updateAll`.
 */
abstract class SnapshotWidget(private val kind: WidgetKind) : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val snapshot = SnapshotStore.widgets(context)
    val state = WidgetStates.of(kind, snapshot, System.currentTimeMillis())
    provideContent {
      WidgetCard(WidgetLinks.open(context, route(snapshot))) {
        if (state is WidgetState.Active) {
          Active(context, state)
          StaleNote(context, state)
        } else {
          SharedState(context, context.getString(label), state, empty)
        }
      }
    }
  }

  protected abstract val label: Int
  protected abstract val empty: Int

  protected open fun route(snapshot: WidgetSnapshot?): String = WidgetLinks.trip(snapshot)

  @Composable
  protected abstract fun Active(context: Context, state: WidgetState.Active)
}

class CountdownWidget : SnapshotWidget(WidgetKind.COUNTDOWN) {
  override val label = R.string.cp_widget_countdown
  override val empty = R.string.cp_widget_countdown_empty

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val s = state.snapshot
    val now = System.currentTimeMillis()
    val leaveBy = s.nextLeaveBy?.takeIf { it.leaveAtMillis > now }
    Label(leaveBy?.title ?: s.destination ?: context.getString(label))
    Gap()
    val target = leaveBy?.leaveAtMillis ?: s.countdownTargetMillis ?: now
    Headline(countdownText(context, Countdown.until(target, now)), size = 28)
    leaveBy?.placeName?.let { Line(it, WidgetTheme.dim) }
  }
}

class VoteWidget : SnapshotWidget(WidgetKind.VOTE) {
  override val label = R.string.cp_widget_vote
  override val empty = R.string.cp_widget_vote_empty

  override fun route(snapshot: WidgetSnapshot?): String = snapshot?.vote?.let { "vote/${it.pollId}" } ?: WidgetLinks.trip(snapshot)

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val vote = requireNotNull(state.snapshot.vote)
    Label(context.getString(R.string.cp_widget_vote_tally, vote.voted, vote.eligible))
    Gap()
    Headline(vote.question ?: context.getString(label), size = 16)
    Gap()
    vote.options.take(3).forEach { option ->
      val mine = option.id == vote.myOptionId
      val winner = option.id == vote.winnerOptionId
      val color = if (mine || winner) WidgetTheme.mint else WidgetTheme.cream
      val text = context.getString(R.string.cp_widget_vote_option, option.label, option.votes)
      Row(
        modifier = if (vote.open && vote.myOptionId == null) {
          GlanceModifier.clickable(
            actionRunCallback<VoteCallback>(actionParametersOf(VoteCallback.POLL to vote.pollId, VoteCallback.OPTION to option.id)),
          )
        } else {
          GlanceModifier
        },
      ) {
        Line(if (mine) "✓ $text" else text, color)
      }
    }
  }
}

class TodayWidget : SnapshotWidget(WidgetKind.TODAY) {
  override val label = R.string.cp_widget_today
  override val empty = R.string.cp_widget_today_empty

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val today = requireNotNull(state.snapshot.today)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT)
    Label(today.tempMaxC?.let { context.getString(R.string.cp_widget_today_weather, it) } ?: context.getString(label))
    Gap()
    today.plan.take(3).forEach { row -> Line("${time.format(Date(row.startsAtMillis))}  ${row.title}") }
    today.briefing.take(if (today.plan.isEmpty()) 3 else 1).forEach { Line(it, WidgetTheme.dim) }
    today.packing.firstOrNull { !it.checked }?.let { item ->
      Row(
        modifier = GlanceModifier.clickable(actionRunCallback<PackingCallback>(actionParametersOf(PackingCallback.ITEM to item.id))),
      ) {
        Line("○ ${item.label}", WidgetTheme.yellow)
      }
    }
  }
}

class BalancesWidget : SnapshotWidget(WidgetKind.BALANCES) {
  override val label = R.string.cp_widget_balances
  override val empty = R.string.cp_widget_balances_empty

  override fun route(snapshot: WidgetSnapshot?): String = "wallet/money"

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val balances = requireNotNull(state.snapshot.balances)
    val owed = balances.netMinor >= 0
    Label(context.getString(if (owed) R.string.cp_widget_balances_owed else R.string.cp_widget_balances_owe))
    Gap()
    Headline(MoneyText.of(balances.currency, kotlin.math.abs(balances.netMinor)), if (owed) WidgetTheme.mint else WidgetTheme.coral)
    val nudgeReady = balances.nudgeAvailableAtMillis?.let { it <= System.currentTimeMillis() } ?: true
    if (owed && balances.nudgeFirstName != null && nudgeReady) {
      Row(modifier = GlanceModifier.clickable(actionRunCallback<NudgeCallback>(actionParametersOf(NudgeCallback.USER to balances.nudgeUserId.orEmpty())))) {
        Line(context.getString(R.string.cp_widget_balances_nudge, balances.nudgeFirstName), WidgetTheme.yellow)
      }
    }
  }
}

class CritterdexWidget : SnapshotWidget(WidgetKind.CRITTERDEX) {
  override val label = R.string.cp_widget_critterdex
  override val empty = R.string.cp_widget_critterdex
  override fun route(snapshot: WidgetSnapshot?): String = "pass"

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    Label(context.getString(label))
    Gap()
    Headline(context.getString(R.string.cp_widget_critterdex_count, state.snapshot.critterdexFound, state.snapshot.critterdexTotal), size = 28)
  }
}

class CrewWidget : SnapshotWidget(WidgetKind.CREW) {
  override val label = R.string.cp_widget_crew
  override val empty = R.string.cp_widget_crew_empty

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val crew = requireNotNull(state.snapshot.crew)
    Label(crew.meetupPlace ?: context.getString(label))
    Gap()
    Row {
      crew.members.take(8).forEach { member ->
        val color = when (member.bucket) {
          "here" -> WidgetTheme.mint
          "close" -> WidgetTheme.yellow
          "on_way" -> WidgetTheme.coral
          else -> WidgetTheme.dim
        }
        Headline(member.initial, color, size = 18)
        Spacer(GlanceModifier.width(6.dp))
      }
    }
  }
}

class NextFlightWidget : SnapshotWidget(WidgetKind.NEXT_FLIGHT) {
  override val label = R.string.cp_widget_next_flight
  override val empty = R.string.cp_widget_next_flight_empty
  override fun route(snapshot: WidgetSnapshot?): String = "wallet/bookings"

  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val flight = requireNotNull(state.snapshot.nextFlight)
    Label("${flight.flightNo} · ${flight.from} → ${flight.to}")
    Gap()
    Headline(countdownText(context, Countdown.until(flight.departsAtMillis, System.currentTimeMillis())))
    flight.gate?.let { Line(context.getString(R.string.cp_widget_gate, it)) }
    flight.delayMin?.takeIf { it > 0 }?.let { Line(context.getString(R.string.cp_widget_delay, it), WidgetTheme.coral) }
  }
}
