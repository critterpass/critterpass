package app.critterpass.alarm

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

/**
 * "SLIDE, I'M UP": drag the yellow knob to the end to confirm. The knob nudges right while idle to
 * show the gesture; a drag short of the end springs back. TalkBack activates it with a double tap.
 */
@Composable
fun SlideToConfirm(label: String, onConfirm: () -> Unit, modifier: Modifier = Modifier) {
  val scope = rememberCoroutineScope()
  val drag = remember { Animatable(0f) }
  var dragging by remember { mutableStateOf(false) }
  var confirmed by remember { mutableStateOf(false) }
  val nudge by
    rememberInfiniteTransition(label = "knob-nudge")
      .animateFloat(0f, 10f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "nudge")
  val density = LocalDensity.current
  val knob = 60.dp
  val inset = 6.dp

  BoxWithConstraints(
    modifier =
      modifier
        .fillMaxWidth()
        .height(knob + inset * 2)
        .background(AlarmColors.track, RoundedCornerShape(50))
        .border(1.5.dp, AlarmColors.trackBorder, RoundedCornerShape(50))
        .semantics {
          contentDescription = label
          onClick(label) {
            if (!confirmed) {
              confirmed = true
              onConfirm()
            }
            true
          }
        },
  ) {
    val travel = with(density) { (maxWidth - knob - inset * 2).toPx() }
    BasicText(
      text = label.uppercase(),
      modifier = Modifier.align(Alignment.Center).padding(start = knob),
      style = TextStyle(color = AlarmColors.cream, fontSize = 17.sp, fontWeight = FontWeight.Black, letterSpacing = 2.sp),
    )
    val idle = if (dragging || confirmed) 0f else with(density) { nudge.dp.toPx() }
    Box(
      contentAlignment = Alignment.Center,
      modifier =
        Modifier.padding(inset)
          .offset { IntOffset((drag.value + idle).roundToInt(), 0) }
          .size(knob)
          .background(AlarmColors.knob, CircleShape)
          .pointerInput(travel) {
            detectHorizontalDragGestures(
              onDragStart = { dragging = true },
              onDragEnd = {
                dragging = false
                scope.launch {
                  if (drag.value >= travel * CONFIRM_AT && !confirmed) {
                    drag.animateTo(travel)
                    confirmed = true
                    onConfirm()
                  } else {
                    drag.animateTo(0f)
                  }
                }
              },
              onDragCancel = {
                dragging = false
                scope.launch { drag.animateTo(0f) }
              },
            ) { change, amount ->
              change.consume()
              scope.launch { drag.snapTo((drag.value + amount).coerceIn(0f, travel)) }
            }
          },
    ) {
      BasicText(text = "→", style = TextStyle(color = AlarmColors.night, fontSize = 26.sp, fontWeight = FontWeight.Bold))
    }
  }
}

private const val CONFIRM_AT = 0.85f

/** Design tokens (packages/design-tokens `color.*`) the alarm screen uses. */
object AlarmColors {
  val night = Color(0xFF0D0B18)
  val cream = Color(0xFFF4EFE4)
  val muted = Color(0xFFA9A3C0)
  val bubble = Color(0xFF221E3D)
  val yellow = Color(0xFFFFD84A)
  val knob = yellow
  val track = Color(0x33FFD84A)
  val trackBorder = Color(0x99E0A92A)
  val warmFloor = Color(0xFF4A3322)
}
