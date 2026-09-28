package app.critterpass.permissions

/**
 * Pure mapping from what Android reports to the app's one normalized status (`@cp/domain`
 * `PERMISSION_STATUSES`). No Android types here, so the JVM unit tests run without a device.
 */
enum class NormalizedStatus(val wire: String) {
  NOT_DETERMINED("not_determined"),
  DENIED("denied"),
  RESTRICTED("restricted"),
  LIMITED("limited"),
  PROVISIONAL("provisional"),
  GRANTED("granted"),
}

data class KindState(val status: NormalizedStatus, val canAskAgain: Boolean) {
  fun toMap(): Map<String, Any> = mapOf("status" to status.wire, "canAskAgain" to canAskAgain)
}

data class LocationState(val state: KindState, val level: String, val precise: Boolean) {
  fun toMap(): Map<String, Any> = state.toMap() + mapOf("level" to level, "precise" to precise)
}

object StatusMapping {
  /**
   * Expo's permission service answers `granted`, `undetermined` (never asked) or `denied`, with
   * `canAskAgain` false once the system stops showing the dialog ("don't ask again").
   */
  fun fromExpo(status: String, canAskAgain: Boolean): KindState =
    when (status) {
      "granted" -> KindState(NormalizedStatus.GRANTED, canAskAgain)
      "undetermined" -> KindState(NormalizedStatus.NOT_DETERMINED, true)
      else -> KindState(NormalizedStatus.DENIED, canAskAgain)
    }

  /** Android 14+: full library access, or only the photos the user picked (limited). */
  fun photos(images: KindState, userSelected: KindState?): KindState =
    when {
      images.status == NormalizedStatus.GRANTED -> images
      userSelected?.status == NormalizedStatus.GRANTED ->
        KindState(NormalizedStatus.LIMITED, images.canAskAgain)
      else -> images
    }

  /**
   * Fine = precise; coarse only = approximate. Background ("Allow all the time") is the Always
   * level; it is only ever asked after foreground was granted, in its own step.
   */
  fun location(fine: KindState, coarse: KindState, background: KindState?): LocationState {
    val precise = fine.status == NormalizedStatus.GRANTED
    val foreground = precise || coarse.status == NormalizedStatus.GRANTED
    if (!foreground) {
      val asked = fine.status != NormalizedStatus.NOT_DETERMINED
      val state = if (asked) KindState(NormalizedStatus.DENIED, fine.canAskAgain && coarse.canAskAgain)
      else KindState(NormalizedStatus.NOT_DETERMINED, true)
      return LocationState(state, "none", false)
    }
    val always = background?.status == NormalizedStatus.GRANTED
    val canAskAgain = if (always) false else background?.canAskAgain ?: true
    return LocationState(
      KindState(NormalizedStatus.GRANTED, canAskAgain),
      if (always) "always" else "wiu",
      precise,
    )
  }

  /**
   * Special app access (exact alarms, full-screen intents, promoted notifications): there is no
   * dialog, only a Settings screen, so the answer is granted or denied and never "ask again".
   */
  fun specialAccess(allowed: Boolean): KindState =
    KindState(if (allowed) NormalizedStatus.GRANTED else NormalizedStatus.DENIED, false)

  /** Below Android 13 notifications need no runtime permission: only the app-level switch counts. */
  fun notificationsLegacy(enabled: Boolean): KindState =
    KindState(if (enabled) NormalizedStatus.GRANTED else NormalizedStatus.DENIED, false)
}
