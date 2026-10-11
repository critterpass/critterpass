package app.critterpass.alarm

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
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
 * "slide, I'm up →" (6.26): drag the sun knob to the end of the frosted track to confirm. The knob nudges right while idle to
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
        .background(TRACK, RoundedCornerShape(50))
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
      text = label,
      modifier = Modifier.align(Alignment.Center).padding(start = knob),
      style = TextStyle(color = AlarmColors.white.copy(alpha = 0.8f), fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    )
    val idle = if (dragging || confirmed) 0f else with(density) { nudge.dp.toPx() }
    Box(
      contentAlignment = Alignment.Center,
      modifier =
        Modifier.padding(inset)
          .offset { IntOffset((drag.value + idle).roundToInt(), 0) }
          .size(knob)
          .background(AlarmColors.sun, CircleShape)
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
      BasicText(text = "→", style = TextStyle(color = AlarmColors.onAccent, fontSize = 26.sp, fontWeight = FontWeight.Bold))
    }
  }
}

private const val CONFIRM_AT = 0.85f

/** 6.26's track: white at .14 over the ink (the design blurs what is behind it; nothing is). */
private val TRACK = AlarmColors.white.copy(alpha = 0.14f)
