package app.critterpass.surfaces.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.critterpass.surfaces.R
import java.text.DateFormat
import java.util.Date

/** The widgets' shared look: ink card, cream type, design-token colours. */
internal object WidgetTheme {
  val card = Color(0xFF17142A)
  val cream = Color(0xFFF4EFE4)
  val dim = Color(0xFFA9A3C0)
  val mint = Color(0xFF54D6A4)
  val coral = Color(0xFFFF6B5B)
  val yellow = Color(0xFFFFD84A)
}

/** In-app routes, opened through the app's link router (the iOS widgets use the same ones). */
internal object WidgetLinks {
  fun scheme(packageName: String): String = when {
    packageName.startsWith("app.critterpass.dev") -> "critterpass-dev"
    packageName.startsWith("app.critterpass.staging") -> "critterpass-staging"
    else -> "critterpass"
  }

  fun open(context: Context, route: String): Action =
    actionStartActivity(
      Intent(Intent.ACTION_VIEW, Uri.parse("${scheme(context.packageName)}://$route"))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )

  fun trip(snapshot: WidgetSnapshot?): String = snapshot?.tripId?.let { "trips/$it" } ?: "trips"
}

@Composable
internal fun WidgetCard(open: Action, content: @Composable ColumnScope.() -> Unit) {
  Column(
    modifier = GlanceModifier.fillMaxSize().background(WidgetTheme.card).cornerRadius(20.dp).padding(14.dp).clickable(open),
    content = content,
  )
}

@Composable
internal fun Label(text: String, color: Color = WidgetTheme.dim) {
  Text(text.uppercase(), style = TextStyle(color = ColorProvider(color), fontSize = 11.sp, fontWeight = FontWeight.Bold), maxLines = 1)
}

@Composable
internal fun Headline(text: String, color: Color = WidgetTheme.cream, size: Int = 22) {
  Text(text, style = TextStyle(color = ColorProvider(color), fontSize = size.sp, fontWeight = FontWeight.Bold), maxLines = 2)
}

@Composable
internal fun Line(text: String, color: Color = WidgetTheme.cream) {
  Text(text, style = TextStyle(color = ColorProvider(color), fontSize = 13.sp), maxLines = 1)
}

@Composable
internal fun Gap() {
  Spacer(GlanceModifier.height(6.dp))
}

/** The states every widget shares: signed out, nothing yet, locked behind a perk, and stale. */
@Composable
internal fun SharedState(context: Context, label: String, state: WidgetState, emptyLine: Int) {
  when (state) {
    WidgetState.SignedOut -> {
      Label(label)
      Gap()
      Line(context.getString(R.string.cp_widget_signed_out))
    }
    WidgetState.Empty -> {
      Label(label)
      Gap()
      Line(context.getString(emptyLine), WidgetTheme.dim)
    }
    is WidgetState.Locked -> {
      Label(label, WidgetTheme.yellow)
      Gap()
      Line(context.getString(if (state.offer == "boost") R.string.cp_widget_locked_boost else R.string.cp_widget_locked_pass_plus))
    }
    is WidgetState.Active -> Unit
  }
}

@Composable
internal fun StaleNote(context: Context, state: WidgetState.Active) {
  if (!state.stale) return
  val at = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(state.snapshot.generatedAtMillis))
  Line(context.getString(R.string.cp_widget_updated_at, at), WidgetTheme.dim)
}

internal fun countdownText(context: Context, countdown: Countdown): String = when {
  countdown.passed -> context.getString(R.string.cp_widget_now)
  countdown.days > 0 -> context.resources.getQuantityString(R.plurals.cp_widget_days, countdown.days.toInt(), countdown.days.toInt())
  countdown.hours > 0 -> context.getString(R.string.cp_widget_hours_minutes, countdown.hours, countdown.minutes)
  else -> context.getString(R.string.cp_widget_minutes, countdown.minutes)
}
