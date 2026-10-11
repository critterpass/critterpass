package app.critterpass.surfaces.widgets

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
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
import app.critterpass.notifications.tokens.CpPremium
import app.critterpass.surfaces.R
import java.text.DateFormat
import java.util.Date

/**
 * The widgets' shared look, the premium palette: a light card with ink type (the dark set when the
 * phone is in dark mode), the crew widget on the ink surface, accents from the tokens.
 */
internal object WidgetTheme {
  private val light = CpPremium.Light
  private val dark = CpPremium.Dark

  val card = ColorProvider(day = light.colorCard, night = dark.colorCard)
  val ink = ColorProvider(day = light.colorInk, night = dark.colorInk)
  val inkSecondary = ColorProvider(day = light.colorInkSecondary, night = dark.colorInkSecondary)
  val muted = ColorProvider(day = light.colorMuted, night = dark.colorMuted)
  val onInk = ColorProvider(day = light.colorOnInk, night = dark.colorOnInk)
  val good = ColorProvider(day = light.colorStatusBookedText, night = dark.colorStatusBookedText)
  val bad = ColorProvider(day = light.colorDestructiveText, night = dark.colorDestructiveText)
  val maybe = ColorProvider(day = light.colorStatusMaybeText, night = dark.colorStatusMaybeText)

  /**
   * The crew widget's ground and type (6.31: ink with white type at full and .7). It stays ink in
   * dark mode too, as on iOS, so the crew reads apart from the other widgets.
   */
  val inkSurface = ColorProvider(day = light.colorInkSurface, night = light.colorInkSurface)
  val onInkSurface = ColorProvider(day = light.colorOnInkSurface, night = light.colorOnInkSurface)
  val onInkSurfaceSoft = ColorProvider(
    day = light.colorOnInkSurface.copy(alpha = 0.7f),
    night = light.colorOnInkSurface.copy(alpha = 0.7f),
  )

  val sun = fixed(CpPremium.Accent.sun)
  val onAccent = fixed(light.colorOnAccent)

  /** A colour that reads the same in light and dark (accents on their own fill). */
  fun fixed(color: Color) = ColorProvider(day = color, night = color)

  /** 6.31's widget corner; the launcher clips it on Android 12 and later. Off the radius scale. */
  val cornerRadius: Dp = 30.dp
  val padding: Dp = 14.dp
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
internal fun WidgetCard(
  open: Action,
  background: ColorProvider = WidgetTheme.card,
  padding: Dp = WidgetTheme.padding,
  content: @Composable ColumnScope.() -> Unit,
) {
  Column(
    modifier = GlanceModifier.fillMaxSize().background(background).cornerRadius(WidgetTheme.cornerRadius).padding(padding).clickable(open),
    content = content,
  )
}

/** The eyebrow: 11.5/700 tracked capitals, muted. */
@Composable
internal fun Label(text: String, color: ColorProvider = WidgetTheme.muted) {
  Text(text.uppercase(), style = TextStyle(color = color, fontSize = 11.5.sp, fontWeight = FontWeight.Bold), maxLines = 1)
}

@Composable
internal fun Headline(text: String, color: ColorProvider = WidgetTheme.ink, size: TextUnit = 22.sp) {
  Text(text, style = TextStyle(color = color, fontSize = size, fontWeight = FontWeight.Bold), maxLines = 2)
}

@Composable
internal fun Line(text: String, color: ColorProvider = WidgetTheme.inkSecondary) {
  Text(text, style = TextStyle(color = color, fontSize = 13.sp), maxLines = 1)
}

/** A sentence-case pill button (6.31 "Nudge Dev": ink, h32 r16, 12.5/600). */
@Composable
internal fun PillButton(text: String, action: Action) {
  Box(
    modifier = GlanceModifier.height(32.dp).cornerRadius(16.dp).background(WidgetTheme.ink).padding(horizontal = 14.dp).clickable(action),
    contentAlignment = Alignment.Center,
  ) {
    Text(text, style = TextStyle(color = WidgetTheme.onInk, fontSize = 12.5.sp, fontWeight = FontWeight.Medium), maxLines = 1)
  }
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
      Line(context.getString(emptyLine), WidgetTheme.muted)
    }
    is WidgetState.Locked -> {
      Label(label, WidgetTheme.maybe)
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
  Line(context.getString(R.string.cp_widget_updated_at, at), WidgetTheme.muted)
}

internal fun countdownText(context: Context, countdown: Countdown): String = when {
  countdown.passed -> context.getString(R.string.cp_widget_now)
  countdown.days > 0 -> context.resources.getQuantityString(R.plurals.cp_widget_days, countdown.days.toInt(), countdown.days.toInt())
  countdown.hours > 0 -> context.getString(R.string.cp_widget_hours_minutes, countdown.hours, countdown.minutes)
  else -> context.getString(R.string.cp_widget_minutes, countdown.minutes)
}
