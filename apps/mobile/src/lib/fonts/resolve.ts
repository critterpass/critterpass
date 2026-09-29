/**
 * Per-script font resolution (design-system.md §6). Deliberately does not import `@cp/design-tokens`
 * — `apps/mobile/src/lib` is a leaf app layer that may only import the `domain` package
 * (tools/lint/boundaries.js), so callers in `ui`/`feature`/`motion` resolve the base token
 * (`resolveTypeVariant(tokens.type.h1)`) themselves and pass in the plain fields `fontFor` needs.
 */

export type LogicalFontFamily = 'archivo' | 'geist' | 'geistMono' | 'voice';

/** The subset of `@cp/design-tokens`' `ResolvedTypeVariant` this module needs, taken structurally. */
export interface BaseTypeStyle {
  readonly fontFamily: LogicalFontFamily;
  readonly fontWeight: number;
  /** Archivo's `wdth` axis step (62/66/70/78/100); ignored for every other family. */
  readonly widthStep?: number;
  readonly lineHeightMultiplier: number;
  readonly condensed: boolean;
}

export type Script = 'latin' | 'vietnamese' | 'thai' | 'cjk';

export interface ResolvedFont {
  /** A bundled font family name (apps/mobile/assets/fonts/<value>.ttf), or the sentinel `'system'`
   * to omit `fontFamily` entirely and let the OS pick its own script-appropriate default. */
  readonly fontFamily: string;
  readonly fontStyle: 'normal' | 'italic';
  /** Multiplies the base token's `fontSize` (design-system.md §6: CJK/Thai display ~0.85x). */
  readonly sizeMultiplier: number;
  /** Replaces (does not multiply) the base token's line-height multiplier for display-class
   * (`condensed`) variants; body-class variants always keep their own value ("body 1.4 all"). */
  readonly lineHeightMultiplier: number;
  /** Uppercase-condensed only applies to Latin + Vietnamese; CJK/Thai render as heavy non-condensed. */
  readonly condensedUpper: boolean;
}

/** BCP-47 (sub)tags mapped to the script bucket that drives family fallback and line-height. */
const SCRIPT_BY_LANGUAGE: Readonly<Record<string, Script>> = {
  vi: 'vietnamese',
  th: 'thai',
  ja: 'cjk',
  ko: 'cjk',
  zh: 'cjk',
};

/** display.mega/hero/xl, h1/h2/h3, title, button.lg/sm all set `condensed: true`; matches design-system.md §1.3/§6. */
const DISPLAY_LINE_HEIGHT: Readonly<Record<Script, number>> = {
  latin: 0.86,
  vietnamese: 1.0,
  thai: 1.0,
  cjk: 1.15,
};

const DISPLAY_SIZE_MULTIPLIER: Readonly<Record<Script, number>> = {
  latin: 1,
  vietnamese: 1,
  thai: 0.85,
  cjk: 0.85,
};

const CONDENSED_SUPPORTED: Readonly<Record<Script, boolean>> = {
  latin: true,
  vietnamese: true,
  thai: false,
  cjk: false,
};

/** `zh-Hans`, `zh-Hant`, `pt-BR` etc. all resolve on their primary language subtag. */
export function scriptForLocale(locale: string): Script {
  const primary = locale.split(/[-_]/, 1)[0]?.toLowerCase() ?? '';
  return SCRIPT_BY_LANGUAGE[primary] ?? 'latin';
}

function archivoFileName(widthStep: number | undefined, weight: number): string {
  const width = widthStep ?? 70;
  return `Archivo-W${width}-${weight}`;
}

function geistFamilyFileName(base: LogicalFontFamily, weight: number): string {
  const displayName = base === 'geistMono' ? 'GeistMono' : 'Geist';
  return `${displayName}-${weight}`;
}

/**
 * The guide voice is Mynerve, one weight, covering Latin and Vietnamese in full (tools/scripts/fonts/
 * build-fonts.py fails the build on a missing Vietnamese letter). It has no Thai or CJK, so those
 * scripts get the body face their text would use anyway, in italic to keep the voice apart
 * (design-system.md §6): Noto Sans Thai for Thai, the OS face for CJK.
 */
function resolveVoice(base: BaseTypeStyle, script: Script): ResolvedFont {
  if (script === 'latin' || script === 'vietnamese') {
    return {
      fontFamily: 'Mynerve-400',
      fontStyle: 'normal',
      sizeMultiplier: 1,
      lineHeightMultiplier: base.lineHeightMultiplier,
      condensedUpper: false,
    };
  }
  return {
    fontFamily: script === 'thai' ? 'NotoSansThai-400' : 'system',
    fontStyle: 'italic',
    sizeMultiplier: 1,
    lineHeightMultiplier: base.lineHeightMultiplier,
    condensedUpper: false,
  };
}

/** Archivo/Geist/Geist Mono cover Latin and Vietnamese in full; only Thai/CJK need a fallback face. */
function resolveLatinFamily(base: BaseTypeStyle, script: Script): ResolvedFont {
  const condensedUpper = base.condensed && CONDENSED_SUPPORTED[script];

  if (script === 'latin' || script === 'vietnamese') {
    const fontFamily =
      base.fontFamily === 'archivo'
        ? archivoFileName(base.widthStep, base.fontWeight)
        : geistFamilyFileName(base.fontFamily, base.fontWeight);
    return {
      fontFamily,
      fontStyle: 'normal',
      sizeMultiplier: 1,
      lineHeightMultiplier: base.condensed
        ? DISPLAY_LINE_HEIGHT[script]
        : base.lineHeightMultiplier,
      condensedUpper,
    };
  }

  if (script === 'thai') {
    // Bundled (tools/scripts/fonts/sources.json): Black for display, Regular for body/mono text.
    const fontFamily = base.condensed ? 'NotoSansThai-900' : 'NotoSansThai-400';
    return {
      fontFamily,
      fontStyle: 'normal',
      sizeMultiplier: base.condensed ? DISPLAY_SIZE_MULTIPLIER.thai : 1,
      lineHeightMultiplier: base.condensed ? DISPLAY_LINE_HEIGHT.thai : base.lineHeightMultiplier,
      condensedUpper: false,
    };
  }

  // CJK is never bundled (design-system.md §1.3): the OS supplies PingFang/Hiragino/Apple SD
  // Gothic (iOS) or Noto CJK (Android) once `fontFamily` is left unset.
  return {
    fontFamily: 'system',
    fontStyle: 'normal',
    sizeMultiplier: base.condensed ? DISPLAY_SIZE_MULTIPLIER.cjk : 1,
    lineHeightMultiplier: base.condensed ? DISPLAY_LINE_HEIGHT.cjk : base.lineHeightMultiplier,
    condensedUpper: false,
  };
}

/** Resolves a token's logical family/weight/width to the concrete face a given locale should render. */
export function fontFor(base: BaseTypeStyle, locale: string): ResolvedFont {
  const script = scriptForLocale(locale);
  if (base.fontFamily === 'voice') return resolveVoice(base, script);
  return resolveLatinFamily(base, script);
}
