import { getLocales } from 'expo-localization';

export interface DeviceLocaleCandidate {
  readonly languageTag: string;
  readonly languageCode: string | null;
}

/**
 * Picks the best match between the device's ordered locale preferences and the app's shipped
 * locales, feeding the app's own rule for its first-ever launch: try the device's preference before
 * falling back to English. `candidates` is injected (rather than read from the registry here) so
 * this stays a plain function of its inputs: an exact
 * BCP-47 match wins, then a same-language match (e.g. device `zh-Hant` still prefers a shipped
 * `zh-Hans` over falling straight to English); `undefined` means fall back to the source locale.
 */
export function pickDeviceLocale(
  candidates: readonly string[],
  deviceLocales: readonly DeviceLocaleCandidate[] = getLocales(),
): string | undefined {
  for (const { languageTag } of deviceLocales) {
    const exact = candidates.find((code) => code.toLowerCase() === languageTag.toLowerCase());
    if (exact) return exact;
  }
  for (const { languageCode } of deviceLocales) {
    if (!languageCode) continue;
    const sameLanguage = candidates.find(
      (code) => code.split(/[-_]/, 1)[0]?.toLowerCase() === languageCode.toLowerCase(),
    );
    if (sameLanguage) return sameLanguage;
  }
  return undefined;
}
