package app.critterpass.appicon

/**
 * The launcher entries the config plugin declares: one `activity-alias` of MainActivity per icon,
 * `CpIcon_default` enabled in the manifest and every other one disabled. Exactly one is enabled at
 * a time; `null` names the default icon.
 */
object AppIconAliases {
  const val PREFIX = "CpIcon_"
  const val DEFAULT = "default"

  fun className(packageName: String, name: String?): String =
    "$packageName.$PREFIX${aliasSuffix(name)}"

  /** `home-set` -> `home_set`: alias class names cannot hold a hyphen. */
  fun aliasSuffix(name: String?): String = (name ?: DEFAULT).replace('-', '_')

  /** The icon name an alias class stands for, or `null` when it is not one of ours. */
  fun nameOf(packageName: String, className: String): String? {
    val prefix = "$packageName.$PREFIX"
    if (!className.startsWith(prefix)) return null
    return className.removePrefix(prefix).replace('_', '-')
  }

  /**
   * The component changes that make [target] the only enabled alias: the target first, so the
   * launcher never sees the app without an entry, then every other alias off.
   */
  fun switchPlan(aliases: List<String>, target: String?): List<Pair<String, Boolean>> {
    val targetName = target ?: DEFAULT
    require(targetName in aliases) { "no launcher alias for icon $targetName" }
    return listOf(targetName to true) + aliases.filter { it != targetName }.map { it to false }
  }

  /**
   * The current icon from each alias's explicit state (`null` = still the manifest default): the
   * alias explicitly enabled other than the default, else `null` for the default icon.
   */
  fun current(states: Map<String, Boolean?>): String? =
    states.entries.firstOrNull { it.key != DEFAULT && it.value == true }?.key
}
