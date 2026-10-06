package app.critterpass.surfaces.widgets

import java.util.Locale

/** The Android widgets, by the snapshot's `WIDGET_KINDS` id. */
enum class WidgetKind(val wire: String) {
  COUNTDOWN("countdown"),
  VOTE("vote"),
  TODAY("today"),
  BALANCES("balances"),
  CRITTERDEX("critterdex"),
  CREW("crew"),
  NEXT_FLIGHT("next_flight"),
}

/** What a widget draws, decided from the snapshot alone (pure, tested off-device). */
sealed interface WidgetState {
  /** No snapshot yet (signed out, or the app has not run since install): open the app. */
  data object SignedOut : WidgetState

  /** Nothing to show for this kind right now (no trip, no open vote). */
  data object Empty : WidgetState

  /** A perk gates the widget: the offer it opens (`boost` or `pass_plus`). */
  data class Locked(val offer: String) : WidgetState

  data class Active(val snapshot: WidgetSnapshot, val stale: Boolean) : WidgetState
}

object WidgetStates {
  /** A snapshot older than this is drawn with its "updated" time, the way iOS marks a stale timeline. */
  const val STALE_AFTER_MS = 6 * 60 * 60 * 1000L

  fun of(kind: WidgetKind, snapshot: WidgetSnapshot?, nowMillis: Long): WidgetState {
    if (snapshot == null) return WidgetState.SignedOut
    when (kind) {
      WidgetKind.CREW -> if (!snapshot.boostActive || "crew" in snapshot.locked) return WidgetState.Locked("boost")
      WidgetKind.NEXT_FLIGHT -> if (!snapshot.passPlus || "next_flight" in snapshot.locked) return WidgetState.Locked("pass_plus")
      else -> Unit
    }
    val empty = when (kind) {
      WidgetKind.COUNTDOWN -> snapshot.countdownTargetMillis == null && snapshot.nextLeaveBy == null
      WidgetKind.VOTE -> snapshot.vote == null
      WidgetKind.TODAY -> snapshot.today == null
      WidgetKind.BALANCES -> snapshot.balances == null
      WidgetKind.CRITTERDEX -> false
      WidgetKind.CREW -> snapshot.crew == null
      WidgetKind.NEXT_FLIGHT -> snapshot.nextFlight == null
    }
    if (empty) return WidgetState.Empty
    return WidgetState.Active(snapshot, stale = nowMillis - snapshot.generatedAtMillis > STALE_AFTER_MS)
  }
}

/** Time left, split for "12 days" / "5h 20m" / "now". */
data class Countdown(val days: Long, val hours: Long, val minutes: Long) {
  val passed: Boolean get() = days == 0L && hours == 0L && minutes == 0L

  companion object {
    fun until(targetMillis: Long, nowMillis: Long): Countdown {
      val left = ((targetMillis - nowMillis).coerceAtLeast(0) + 59_999) / 60_000
      return Countdown(left / (24 * 60), (left / 60) % 24, left % 60)
    }
  }
}

/** Money in minor units with the currency's own decimals (VND and JPY have none). */
object MoneyText {
  // The same zero-exponent set the server uses (packages/domain/src/pitches/validate.ts).
  private val zeroDecimal = setOf("JPY", "VND", "IDR", "KRW", "CLP", "ISK", "TWD", "HUF")

  fun of(currency: String, minor: Long): String {
    val sign = if (minor < 0) "−" else ""
    val abs = kotlin.math.abs(minor)
    val amount = if (currency in zeroDecimal) {
      String.format(Locale.US, "%,d", abs)
    } else {
      String.format(Locale.US, "%,d.%02d", abs / 100, abs % 100)
    }
    return "$sign$amount $currency"
  }
}
