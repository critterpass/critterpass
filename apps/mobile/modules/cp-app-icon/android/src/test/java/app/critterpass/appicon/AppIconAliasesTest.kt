package app.critterpass.appicon

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppIconAliasesTest {
  private val pkg = "app.critterpass.dev"

  @Test
  fun aliasClassNamesRoundTripHyphenatedIcons() {
    val className = AppIconAliases.className(pkg, "home-set")
    assertEquals("app.critterpass.dev.CpIcon_home_set", className)
    assertEquals("home-set", AppIconAliases.nameOf(pkg, className))
    assertEquals("default", AppIconAliases.nameOf(pkg, AppIconAliases.className(pkg, null)))
    assertNull(AppIconAliases.nameOf(pkg, "app.critterpass.dev.MainActivity"))
  }

  @Test
  fun switchEnablesTheTargetBeforeDisablingTheRest() {
    val plan = AppIconAliases.switchPlan(listOf("default", "face", "stamp"), "face")
    assertEquals(listOf("face" to true, "default" to false, "stamp" to false), plan)
  }

  @Test
  fun switchingToNullRestoresTheDefaultAlias() {
    val plan = AppIconAliases.switchPlan(listOf("default", "face"), null)
    assertEquals(listOf("default" to true, "face" to false), plan)
  }

  @Test(expected = IllegalArgumentException::class)
  fun unknownIconIsRejected() {
    AppIconAliases.switchPlan(listOf("default"), "golden")
  }

  @Test
  fun currentIsTheExplicitlyEnabledNonDefaultAlias() {
    assertNull(AppIconAliases.current(mapOf("default" to null, "face" to null)))
    assertNull(AppIconAliases.current(mapOf("default" to true, "face" to false)))
    assertEquals("face", AppIconAliases.current(mapOf("default" to false, "face" to true)))
  }
}
