package app.critterpass.surfaces.widgets

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.critterpass.notifications.tokens.CpPremium
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
      WidgetCard(WidgetLinks.open(context, route(snapshot)), cardBackground, cardPadding) {
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
  protected open val cardBackground: ColorProvider = WidgetTheme.card
  protected open val cardPadding: Dp = WidgetTheme.padding

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
    Headline(countdownText(context, Countdown.until(target, now)), size = 28.sp)
    leaveBy?.placeName?.let { Line(it, WidgetTheme.muted) }
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
    Headline(vote.question ?: context.getString(label), size = 16.sp)
    Gap()
    vote.options.take(3).forEach { option ->
      val mine = option.id == vote.myOptionId
      val winner = option.id == vote.winnerOptionId
      val color = if (mine || winner) WidgetTheme.good else WidgetTheme.ink
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
  override val cardPadding: Dp = 18.dp

  /** 6.31: the eyebrow, "Today" 30/800 with the high on the right, then the plan rows. */
  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val today = requireNotNull(state.snapshot.today)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT)
    state.snapshot.destination?.let { Label(it) }
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Headline(context.getString(label), size = 30.sp)
      Spacer(GlanceModifier.defaultWeight())
      today.tempMaxC?.let { Headline(context.getString(R.string.cp_widget_degrees, it), size = 22.sp) }
    }
    Gap()
    today.plan.take(3).forEach { row ->
      Row(modifier = GlanceModifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
          time.format(Date(row.startsAtMillis)),
          modifier = GlanceModifier.width(44.dp),
          style = TextStyle(color = WidgetTheme.ink, fontSize = 13.5.sp, fontWeight = FontWeight.Bold),
          maxLines = 1,
        )
        // The snapshot's plan rows carry no colour of their own, so every bar is sun.
        Box(GlanceModifier.width(4.dp).height(28.dp).cornerRadius(2.dp).background(WidgetTheme.sun)) {}
        Spacer(GlanceModifier.width(10.dp))
        Text(row.title, style = TextStyle(color = WidgetTheme.ink, fontSize = 14.5.sp, fontWeight = FontWeight.Medium), maxLines = 1)
      }
    }
    today.briefing.take(if (today.plan.isEmpty()) 3 else 1).forEach { Line(it, WidgetTheme.inkSecondary) }
    today.packing.firstOrNull { !it.checked }?.let { item ->
      Row(
        modifier = GlanceModifier.clickable(actionRunCallback<PackingCallback>(actionParametersOf(PackingCallback.ITEM to item.id))),
      ) {
        Line("○ ${item.label}", WidgetTheme.maybe)
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
    Headline(MoneyText.of(balances.currency, kotlin.math.abs(balances.netMinor)), size = 36.sp)
    val nudgeReady = balances.nudgeAvailableAtMillis?.let { it <= System.currentTimeMillis() } ?: true
    if (owed && balances.nudgeFirstName != null && nudgeReady) {
      Spacer(GlanceModifier.height(10.dp))
      PillButton(
        context.getString(R.string.cp_widget_balances_nudge, balances.nudgeFirstName),
        actionRunCallback<NudgeCallback>(actionParametersOf(NudgeCallback.USER to balances.nudgeUserId.orEmpty())),
      )
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
    Headline(context.getString(R.string.cp_widget_critterdex_count, state.snapshot.critterdexFound, state.snapshot.critterdexTotal), size = 28.sp)
  }
}

class CrewWidget : SnapshotWidget(WidgetKind.CREW) {
  override val label = R.string.cp_widget_crew
  override val empty = R.string.cp_widget_crew_empty
  override val cardBackground: ColorProvider = WidgetTheme.inkSurface

  /**
   * 6.31 on ink: the meet-up and its time with the Boost chip, then each crewmate as an initial
   * on their ETA colour (the contract carries initials, never names).
   */
  @Composable
  override fun Active(context: Context, state: WidgetState.Active) {
    val crew = requireNotNull(state.snapshot.crew)
    val time = DateFormat.getTimeInstance(DateFormat.SHORT)
    val place = listOfNotNull(crew.meetupPlace ?: context.getString(label), crew.meetAtMillis?.let { time.format(Date(it)) })
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Label(place.joinToString(" · "), WidgetTheme.onInkSurfaceSoft)
      Spacer(GlanceModifier.width(6.dp))
      Box(
        modifier = GlanceModifier.cornerRadius(6.dp).background(WidgetTheme.fixed(CpPremium.Accent.pink)).padding(horizontal = 6.dp, vertical = 2.dp),
      ) {
        Text(
          context.getString(R.string.cp_widget_crew_boost).uppercase(),
          style = TextStyle(color = WidgetTheme.onAccent, fontSize = 9.5.sp, fontWeight = FontWeight.Bold),
          maxLines = 1,
        )
      }
    }
    Spacer(GlanceModifier.height(12.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
      crew.members.take(6).forEach { member ->
        val fill = when (member.bucket) {
          "here" -> CpPremium.Accent.mint
          "close" -> CpPremium.Accent.sun
          "on_way" -> CpPremium.Accent.tangerine
          else -> CpPremium.Accent.neutral
        }
        Box(
          modifier = GlanceModifier.size(24.dp).cornerRadius(12.dp).background(WidgetTheme.fixed(fill)),
          contentAlignment = Alignment.Center,
        ) {
          Text(member.initial, style = TextStyle(color = WidgetTheme.onAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        }
        Spacer(GlanceModifier.width(4.dp))
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
    flight.delayMin?.takeIf { it > 0 }?.let { Line(context.getString(R.string.cp_widget_delay, it), WidgetTheme.bad) }
  }
}
