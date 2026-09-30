package app.critterpass.alarm

import android.annotation.SuppressLint
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The 5b-3 layout: night background warming toward the floor, the guide-tinted glow disc pulsing
 * with the ring, the leave-by time huge, the place and pickup line, Tokek hopping on the beat, the
 * guide's line in a speech bubble, the slider and (while unused) the one snooze.
 */
@Composable
fun AlarmScreen(request: AlarmRequest, crewPinged: Boolean, onUp: () -> Unit, onSnooze: () -> Unit) {
  val tint = Color(AlarmPlan.tintArgb(request.tintHex) ?: 0xFFFF9A4D.toInt())
  val beat = rememberInfiniteTransition(label = "alarm-beat")
  val pulse by beat.animateFloat(0.92f, 1.06f, infiniteRepeatable(tween(BEAT_MS), RepeatMode.Reverse), label = "pulse")
  val hop by beat.animateFloat(0f, -18f, infiniteRepeatable(tween(BEAT_MS / 2), RepeatMode.Reverse), label = "hop")

  Box(
    modifier =
      Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(AlarmColors.night, AlarmColors.night, AlarmColors.warmFloor))),
  ) {
    Canvas(modifier = Modifier.fillMaxSize()) {
      val radius = size.width * 0.9f * pulse
      drawCircle(
        brush = Brush.radialGradient(listOf(tint.copy(alpha = 0.55f), tint.copy(alpha = 0.18f), Color.Transparent),
          center = Offset(size.width / 2, size.height * 1.02f), radius = radius),
        radius = radius,
        center = Offset(size.width / 2, size.height * 1.02f),
      )
    }
    Column(
      modifier = Modifier.fillMaxSize().systemBarsPadding().padding(horizontal = 20.dp, vertical = 24.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      BasicText(
        text = request.title.uppercase(),
        style = TextStyle(color = tint, fontSize = 13.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp, textAlign = TextAlign.Center),
      )
      BasicText(
        text = AlarmPlan.clockText(request.leaveAt),
        style = TextStyle(color = AlarmColors.cream, fontSize = 104.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center),
      )
      BasicText(
        text = request.subtitle,
        style = TextStyle(color = AlarmColors.muted, fontSize = 16.sp, textAlign = TextAlign.Center),
      )
      Spacer(Modifier.weight(1f))
      Tokek(modifier = Modifier.offset(y = hop.dp))
      Spacer(Modifier.height(20.dp))
      if (request.guideLine.isNotBlank()) {
        BasicText(
          text = request.guideLine,
          modifier = Modifier.fillMaxWidth().background(AlarmColors.bubble, RoundedCornerShape(18.dp)).padding(horizontal = 18.dp, vertical = 14.dp),
          style = TextStyle(color = AlarmColors.yellow, fontSize = 18.sp, fontStyle = FontStyle.Italic),
        )
      }
      Spacer(Modifier.weight(1f))
      SlideToConfirm(label = request.labels.slide, onConfirm = onUp)
      Spacer(Modifier.height(18.dp))
      SnoozeLine(request, crewPinged, onSnooze)
    }
  }
}

@Composable
private fun SnoozeLine(request: AlarmRequest, crewPinged: Boolean, onSnooze: () -> Unit) {
  Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
    when {
      crewPinged ->
        BasicText(request.labels.crewPinged, style = TextStyle(color = AlarmColors.cream, fontSize = 16.sp, fontWeight = FontWeight.Bold))
      request.snoozeAllowed -> {
        BasicText(
          text = request.labels.snooze,
          modifier = Modifier.clickable(onClick = onSnooze).padding(horizontal = 16.dp, vertical = 6.dp),
          style = TextStyle(color = AlarmColors.cream, fontSize = 16.sp, fontWeight = FontWeight.Bold),
        )
        BasicText(request.labels.snoozeNote, style = TextStyle(color = AlarmColors.muted, fontSize = 13.sp, fontStyle = FontStyle.Italic))
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
  if (id != 0) Image(painter = painterResource(id), contentDescription = null, modifier = modifier.size(150.dp))
}

private const val BEAT_MS = 600
private const val TOKEK_DRAWABLE = "critter_gecko_common_cheer_color_96pt"
