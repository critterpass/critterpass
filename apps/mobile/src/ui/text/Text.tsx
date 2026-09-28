import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';
import type { StyleProp, TextProps as RNTextProps, TextStyle } from 'react-native';

import type { TypographyValue } from '@cp/design-tokens';
import { resolveTypeVariant, tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';

import { textLayoutProblems } from '../qa/text-layout-check';
import { reportUiQa, UI_QA_ENABLED } from '../qa/ui-qa';
import type { SurfaceTone } from '../surface/Scaffold';
import { useSurfaceTone } from '../surface/Scaffold';
import type { Theme } from '../theme';
import { useTheme } from '../theme';
import { ADVANCE_RATIO, AUTO_FIT_MIN_SCALE, useAutoFit } from './auto-fit';
import { glyphRoomStyle, topGlyphRoomEm } from './glyph-room';

const { type } = tokens;

/** Every typography token as a `<Text variant>` name (docs/design-system.md §1.3). */
export const TEXT_VARIANTS = {
  displayMega: type.display.mega,
  displayHero: type.display.hero,
  displayXl: type.display.xl,
  h1: type.h1,
  h2: type.h2,
  h3: type.h3,
  title: type.title,
  buttonLg: type.button.lg,
  buttonSm: type.button.sm,
  eyebrow: type.eyebrow,
  label: type.label,
  bodyLg: type.body.lg,
  body: type.body.base,
  bodySm: type.body.sm,
  rowTitle: type.rowTitle,
  caption: type.caption,
  input: type.input.base,
  inputOtp: type.input.otp,
  monoData: type.mono.data,
  voice: type.voice.base,
  voicePostcard: type.voice.postcard,
  voiceSignature: type.voice.signature,
} as const satisfies Record<string, TypographyValue>;

export type TextVariant = keyof typeof TEXT_VARIANTS;

export interface TextProps extends Omit<RNTextProps, 'style' | 'children' | 'allowFontScaling'> {
  readonly variant?: TextVariant | undefined;
  readonly children?: ReactNode;
  /** Colour override; defaults to the surface's primary text colour (secondary for eyebrows). */
  readonly color?: string | undefined;
  /** Overrides the variant's own auto-fit rule (on for display + h1). */
  readonly autoFit?: boolean | undefined;
  /** Auto-fit floor in points (default: the variant's minimum scale of its scaled size). */
  readonly autoFitMinSize?: number | undefined;
  /**
   * The size a render sets this string at, inside the variant's auto-fit range (h1: 40–52), in
   * place of the variant's nominal size. Dynamic Type scales it the same way and auto-fit still
   * shrinks from it; outside the range it is clamped.
   */
  readonly designSize?: number | undefined;
  readonly style?: StyleProp<TextStyle> | undefined;
}

/** Ratio of a render's size for one string to the variant's nominal size, kept inside its range. */
function designScale(token: TypographyValue, designSize: number | undefined): number {
  const nominal = token.fontSize ?? token.fontSizeMax;
  if (designSize === undefined || nominal === undefined) return 1;
  const low = token.fontSizeMin ?? nominal;
  const high = token.fontSizeMax ?? nominal;
  return Math.min(high, Math.max(low, designSize)) / nominal;
}

function defaultColor(theme: Theme, tone: SurfaceTone, secondary: boolean): string {
  if (tone === 'accent') return theme.semantic.text.onAccent;
  if (tone === 'paper') return secondary ? theme.color.paper.muted : theme.color.paper.ink;
  return secondary ? theme.semantic.text.secondary : theme.semantic.text.primary;
}

/** Uppercases plain string children with the locale's own casing rules (Turkish İ, ß→SS). */
function transformChildren(
  children: ReactNode,
  locale: string,
): { children: ReactNode; hasElements: boolean } {
  let hasElements = false;
  const mapped = Children.map(children, (child) => {
    if (typeof child === 'string') return upper(child, locale);
    if (isValidElement(child)) hasElements = true;
    return child;
  });
  return { children: mapped, hasElements };
}

function plainText(children: ReactNode): string | null {
  const parts: string[] = [];
  let plain = true;
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') parts.push(String(child));
    else if (child !== null && child !== undefined && typeof child !== 'boolean') plain = false;
  });
  return plain ? parts.join('') : null;
}

/**
 * The app's only text primitive: token typography per locale script (`fontFor`), uppercase at
 * render, tabular numerals where the token asks for them, Dynamic Type scaled per variant (display
 * and h1 damped to 0.5×, capped at AX3) and auto-fit for display/h1 strings.
 */
export function Text({
  variant = 'body',
  children,
  color,
  autoFit,
  autoFitMinSize,
  designSize,
  style,
  numberOfLines,
  onLayout,
  onTextLayout,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const tone = useSurfaceTone();
  const locale = useLocale();
  const { fontScale, plainGuideText } = useThemeSettings();
  const token = TEXT_VARIANTS[variant];
  const resolved = resolveTypeVariant(token, { fontScale });

  const widthStep = token.widthStep ?? token.widthStepMin;
  const fallback = plainGuideText ? token.plainTextFallback : undefined;
  const font = fontFor(
    {
      fontFamily: fallback?.fontFamily ?? token.fontFamily,
      fontWeight: fallback?.fontWeight ?? token.fontWeight,
      ...(widthStep !== undefined ? { widthStep } : {}),
      lineHeightMultiplier: resolved.lineHeightMultiplier,
      condensed: token.condensed,
    },
    locale,
  );

  const uppercase = token.textTransform === 'uppercase';
  const transformed = uppercase
    ? transformChildren(children, locale)
    : { children, hasElements: false };
  const text = plainText(transformed.children);
  const { singleLine, maxLines: tokenMaxLines } = token.dynamicType;
  const lineLimit = numberOfLines ?? (singleLine ? 1 : tokenMaxLines);
  const scaledSize = resolved.fontSize * font.sizeMultiplier * designScale(token, designSize);
  const fit = useAutoFit({
    enabled: (autoFit ?? token.dynamicType.autoFit === true) && text !== null,
    // A line count the caller set is kept; the variant's own single line wraps at the floor.
    wrapAtFloor: numberOfLines === undefined,
    text: text ?? '',
    maxSize: scaledSize,
    minSize: Math.min(
      scaledSize,
      autoFitMinSize ?? scaledSize * (token.dynamicType.minScale ?? AUTO_FIT_MIN_SCALE),
    ),
    maxLines: lineLimit ?? Number.POSITIVE_INFINITY,
    advanceRatio: token.condensed ? ADVANCE_RATIO.condensed : ADVANCE_RATIO.regular,
    letterSpacingEm: token.letterSpacing ?? 0,
  });

  const fontSize = fit.fontSize;
  const variantStyle: TextStyle = {
    fontSize,
    lineHeight: fontSize * font.lineHeightMultiplier,
    letterSpacing: (token.letterSpacing ?? 0) * fontSize,
    fontStyle: fallback?.fontStyle ?? font.fontStyle,
    color: color ?? defaultColor(theme, tone, variant === 'eyebrow'),
    ...(font.fontFamily === 'system'
      ? { fontWeight: String(token.fontWeight) as TextStyle['fontWeight'] }
      : { fontFamily: font.fontFamily }),
    ...(token.tabularNumerals ? { fontVariant: ['tabular-nums'] } : {}),
    // Element children (e.g. `<Trans>`) can't be cased in JS; the platform transform covers them.
    ...(uppercase && transformed.hasElements ? { textTransform: 'uppercase' } : {}),
  };

  // Tight display leading would otherwise clip cap tops and stacked marks (Ệ, Ữ) off the first line.
  const room = glyphRoomStyle(
    topGlyphRoomEm(font.fontFamily, font.lineHeightMultiplier) * fontSize,
    style,
  );

  return (
    <RNText
      {...rest}
      allowFontScaling={false}
      numberOfLines={fit.numberOfLines}
      style={[variantStyle, style, room]}
      onLayout={(event) => {
        fit.onLayout(event);
        onLayout?.(event);
      }}
      onTextLayout={(event) => {
        const adjusting = fit.onTextLayout(event);
        if (UI_QA_ENABLED && !adjusting && text !== null) {
          const problems = textLayoutProblems({
            lines: event.nativeEvent.lines,
            text,
            truncationIsBug: numberOfLines === undefined,
            cutByFit: fit.overflowed,
          });
          for (const code of problems) reportUiQa(code, rest.testID ?? text.slice(0, 40), variant);
        }
        onTextLayout?.(event);
      }}
    >
      {transformed.children}
    </RNText>
  );
}
