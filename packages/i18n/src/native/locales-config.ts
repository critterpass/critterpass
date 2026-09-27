/**
 * Per-app language configuration for both platforms, generated from the shipped locale list so
 * confirming the founder-exception languages (registering more `shipped: true` entries) does not
 * need a second, hand-maintained list anywhere (design-system.md's own "no code change" promise for
 * that confirmation, product-decisions.md §7 open question 1).
 */

/** Value for the iOS `CFBundleLocalizations` Info.plist key — a config plugin (code-standards.md
 * §14: native project files are never hand-edited) writes this array in, this only produces it. */
export function cfBundleLocalizations(shippedLocaleCodes: readonly string[]): string[] {
  return [...shippedLocaleCodes];
}

/** Android's per-app language config (`res/xml/locales_config.xml`, API 33+ with the AppCompat
 * backport for earlier versions); uses plain BCP-47 tags, not the `values-b+lang+Script` resource
 * qualifier form strings.xml directories use. */
export function generateAndroidLocalesConfig(shippedLocaleCodes: readonly string[]): string {
  const locales = shippedLocaleCodes
    .map((code) => `    <locale android:name="${code}"/>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<locale-config xmlns:android="http://schemas.android.com/apk/res/android">',
    locales,
    '</locale-config>',
    '',
  ].join('\n');
}
