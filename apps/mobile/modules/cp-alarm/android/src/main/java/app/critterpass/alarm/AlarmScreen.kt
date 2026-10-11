package app.critterpass.alarm

import android.annotation.SuppressLint
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.critterpass.notifications.R as NotificationsR
import app.critterpass.notifications.tokens.CpPremium
import kotlin.math.hypot
import kotlin.math.max

/**
 * The 6.26 leave-by alarm: ink ground with a pulsing tangerine glow, the eyebrow, the leave-by time
 * huge, the pickup line, Tokek wobbling, the guide's line in Borel, the slider and (while unused)
 * the one snooze. Positions follow the 390 × 844 design and shrink with shorter screens.
 */
@Composable
fun AlarmScreen(request: AlarmRequest, crewPinged: Boolean, onUp: () -> Unit, onSnooze: () -> Unit) {
  val beat = rememberInfiniteTransition(label = "alarm-beat")
  val pulse by beat.animateFloat(0.75f, 1f, infiniteRepeatable(tween(GLOW_PULSE_MS), RepeatMode.Reverse), label = "glow")
  val wobble by beat.animateFloat(
    initialValue = 0f,
    targetValue = 0f,
    animationSpec = infiniteRepeatable(
      keyframes {
        durationMillis = WOBBLE_MS
        -8f at 0 using FastOutSlowInEasing
        8f at WOBBLE_MS / 10 using FastOutSlowInEasing
        -8f at WOBBLE_MS * 2 / 10 using FastOutSlowInEasing
        8f at WOBBLE_MS * 3 / 10 using FastOutSlowInEasing
        0f at WOBBLE_MS * 4 / 10 using FastOutSlowInEasing
      },
    ),
    label = "wobble",
  )
  val borel = remember { FontFamily(Font(NotificationsR.font.cp_borel)) }

  BoxWithConstraints(modifier = Modifier.fillMaxSize().background(AlarmColors.ground)) {
    val scale = (maxHeight / DESIGN_HEIGHT).coerceAtMost(1f)
    fun y(design: Int): Dp = design.dp * scale

    Canvas(modifier = Modifier.fillMaxSize()) {
      val center = Offset(size.width / 2, size.height * GLOW_Y)
      val radius = hypot(max(center.x, size.width - center.x), max(center.y, size.height - center.y)) * GLOW_REACH
      drawCircle(
        brush = Brush.radialGradient(listOf(AlarmColors.glow.copy(alpha = GLOW_ALPHA * pulse), Color.Transparent), center, radius),
        radius = radius,
        center = center,
      )
    }
    Column(
      modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).offset(y = y(82)),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      BasicText(
        text = request.title.uppercase(),
        style = TextStyle(
          color = AlarmColors.white.copy(alpha = 0.7f),
          fontSize = 13.sp,
          fontWeight = FontWeight.Bold,
          letterSpacing = 0.08.em,
          textAlign = TextAlign.Center,
        ),
      )
      BasicText(
        text = AlarmPlan.clockText(request.leaveAt),
        style = TextStyle(
          color = AlarmColors.white,
          fontSize = 104.sp,
          fontWeight = FontWeight.Bold,
          letterSpacing = (-0.04).em,
          fontFeatureSettings = "tnum",
          textAlign = TextAlign.Center,
        ),
      )
      BasicText(
        text = request.subtitle,
        style = TextStyle(color = AlarmColors.white.copy(alpha = 0.8f), fontSize = 15.sp, textAlign = TextAlign.Center),
      )
    }
    Tokek(
      modifier = Modifier.align(Alignment.TopCenter).offset(y = y(300)).size(160.dp * scale).rotate(wobble),
    )
    if (request.guideLine.isNotBlank()) {
      BasicText(
        text = request.guideLine,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 32.dp).offset(y = y(500)),
        style = TextStyle(
          color = AlarmColors.sun,
          fontFamily = borel,
          fontSize = 17.sp,
          lineHeight = 25.5.sp,
          textAlign = TextAlign.Center,
        ),
      )
    }
    SlideToConfirm(
      label = request.labels.slide,
      onConfirm = onUp,
      modifier = Modifier.align(Alignment.BottomCenter).padding(horizontal = 24.dp).offset(y = -y(120)),
    )
    SnoozeLine(
      request,
      crewPinged,
      onSnooze,
      modifier = Modifier.align(Alignment.BottomCenter).offset(y = -y(58)),
    )
  }
}

@Composable
private fun SnoozeLine(request: AlarmRequest, crewPinged: Boolean, onSnooze: () -> Unit, modifier: Modifier = Modifier) {
  Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
    when {
      crewPinged ->
        BasicText(request.labels.crewPinged, style = TextStyle(color = AlarmColors.white, fontSize = 15.sp, fontWeight = FontWeight.SemiBold))
      request.snoozeAllowed -> {
        BasicText(
          text = request.labels.snooze,
          modifier = Modifier.clickable(onClick = onSnooze).padding(horizontal = 16.dp, vertical = 6.dp),
          style = TextStyle(color = AlarmColors.white, fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
        )
        BasicText(request.labels.snoozeNote, style = TextStyle(color = AlarmColors.white.copy(alpha = 0.6f), fontSize = 12.sp))
      }
    }
  }
}

/** The app's baked Tokek (critter art in the app's own resources); nothing when absent. */
@SuppressLint("DiscouragedApi")
@Composable
private fun Tokek(modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val id = remember { context.resources.getIdentifier(TOKEK_DRAWABLE, "drawable", context.packageName) }
  if (id != 0) Image(painter = painterResource(id), contentDescription = null, modifier = modifier)
}

/** The premium tokens the alarm screen uses. */
object AlarmColors {
  val ground = CpPremium.Light.colorInk
  val white = CpPremium.Light.colorOnInk
  val sun = CpPremium.Accent.sun
  val glow = CpPremium.Accent.tangerine
  val onAccent = CpPremium.Light.colorOnAccent
}

private val DESIGN_HEIGHT = 844.dp
private const val GLOW_Y = 0.36f
private const val GLOW_ALPHA = 0.4f
/** The glow is gone at 60% of the way to the farthest corner (CSS `radial-gradient` default). */
private const val GLOW_REACH = 0.6f
private const val GLOW_PULSE_MS = 1_200
/** Tokek's sticker wobble: −8°, 8°, −8°, 8°, 0° over the first 40%, then still. */
private const val WOBBLE_MS = 1_800
private const val TOKEK_DRAWABLE = "critter_gecko_common_cheer_color_96pt"
