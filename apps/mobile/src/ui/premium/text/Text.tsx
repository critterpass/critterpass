import { Children } from 'react';
import type { ReactNode } from 'react';
import { Platform, Text as RNText, StyleSheet } from 'react-native';
import type { StyleProp, TextProps as RNTextProps, TextStyle } from 'react-native';

import type { PremiumPalette, PremiumTypeStyle } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';
import { textLayoutProblems } from '@/lib/qa/text-layout-check';
import { reportUiQa, UI_QA_ENABLED } from '@/lib/qa/ui-qa';

import type { PremiumTypeName } from '../theme/kit-type';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { useReportBodyTitle } from './body-title';
import { markRoom, marksClipped } from './mark-room';
import { tieLastWords } from './widow-tie';

/** Palette roles a text can take by name; any other colour is passed as `color`. */
export type PremiumTextTone = Extract<
  keyof PremiumPalette,
  'ink' | 'inkSecondary' | 'muted' | 'placeholder' | 'onInk' | 'onAccent' | 'caret' | 'guideName'
>;

export interface PremiumTextProps extends Omit<RNTextProps, 'allowFontScaling'> {
  /** @default 'body' */
  readonly variant?: PremiumTypeName;
  /** @default 'ink' */
  readonly tone?: PremiumTextTone;
  /** A colour from the theme that is not a named tone (status tints, accents). */
  readonly color?: string | undefined;
  readonly align?: TextStyle['textAlign'];
  /**
   * The design sets this text on one line, so a second line at the default text size is reported
   * as a layout bug. On by default for control labels; `false` for a label the design sets on two
   * lines.
   */
  readonly singleLine?: boolean;
}

/** Labels set inside a control (button, pill, segment, tag, badge): one line by design. */
const ONE_LINE_VARIANTS: ReadonlySet<PremiumTypeName> = new Set<PremiumTypeName>([
  'button',
  'buttonSmall',
  'textButton',
  'glassTitle',
  'segment',
  'chip',
  'pillSmall',
  'badge',
  'toastAction',
  'bannerAction',
  'noteAction',
  'placeTag',
  'tier',
]);

/**
 * How far a one-line label held to one line may shrink to fit whole. Only labels in a slot of fixed
 * width step down: a badge, tier or place tag. A segment keeps its size beside its neighbours (it
 * wraps instead: shrunk one by one, a control showed three sizes). Button, pill and chip labels keep their size: their pill grows with the label, and a
 * full-width button wraps a long label onto a second line, so one screen never shows its actions
 * at different sizes.
 */
const LABEL_FIT_FLOOR: Partial<Record<PremiumTypeName, number>> = {
  badge: 0.75,
  tier: 0.75,
  placeTag: 0.75,
};

/**
 * The design sets its mono labels in capitals with their tracking (CREW CODE, PAGE 07 ·
 * REFERRALS, FOUND IT · WINSTON'S CREW), so the variant does, whatever case the copy is in. A
 * caller showing text as it was written (a scanned line) sets `textTransform: 'none'`.
 */
const CAPS: TextStyle = { textTransform: 'uppercase' };

/** Headings the design never leaves a lone word under ("Remove from the / Crew?"). */
const BALANCED_VARIANTS: ReadonlySet<PremiumTypeName> = new Set<PremiumTypeName>([
  'hero',
  'display',
  'displayLarge',
  'largeTitle',
  'emptyTitle',
  'title',
]);

/**
 * Centred lines (footnotes, empty states) and headings break so their last line never holds one
 * word: Android balances the lines, iOS pushes a word down to keep the last one company.
 */
const BALANCED = Platform.select<RNTextProps>({
  android: { textBreakStrategy: 'balanced' },
  ios: { lineBreakStrategyIOS: 'push-out' },
  default: {},
});

/** Full-width breaking for a text set from the start (see `unbalanced` below). */
const UNBALANCED = 'highQuality' as const;

/** The children as one string, or `null` when they hold elements (nested styled spans). */
function plainText(children: ReactNode): string | null {
  const parts: string[] = [];
  let plain = true;
  Children.forEach(children, (child) => {
    if (typeof child === 'string' || typeof child === 'number') parts.push(String(child));
    else if (child !== null && child !== undefined && typeof child !== 'boolean') plain = false;
  });
  return plain ? parts.join('') : null;
}

/** Font face for a type style; the guide's Borel and the mono face fall back by script. */
export function premiumFont(
  style: PremiumTypeStyle,
  locale: string,
  plainGuideText: boolean,
): Pick<TextStyle, 'fontFamily' | 'fontWeight' | 'fontStyle'> {
  if (style.family === 'system') return { fontWeight: style.weight };
  if (style.family === 'guide' && plainGuideText) {
    return { fontWeight: style.weight, fontStyle: 'italic' };
  }
  const resolved = fontFor(
    {
      fontFamily: style.family === 'guide' ? 'voice' : 'geistMono',
      fontWeight: Number(style.weight),
      lineHeightMultiplier: 1,
      condensed: false,
    },
    locale,
  );
  return resolved.fontFamily === 'system'
    ? { fontWeight: style.weight, fontStyle: resolved.fontStyle }
    : { fontFamily: resolved.fontFamily, fontStyle: resolved.fontStyle };
}

/** A number from a flattened style, or 0 for a missing or relative one. */
function points(...values: readonly unknown[]): number {
  for (const value of values) if (typeof value === 'number') return value;
  return 0;
}

/**
 * The top padding that keeps stacked marks whole (`./mark-room`), balanced by as much negative top
 * margin so the text's baseline and the layout around it stay where they were. iOS draws glyphs
 * into the text's padding; Android's own font padding already gives them room.
 */
function markRoomStyle(
  text: string | null,
  size: number,
  tokenLineHeight: number | undefined,
  scale: number,
  style: StyleProp<TextStyle>,
): { readonly room: number; readonly style: TextStyle | null } {
  if (Platform.OS !== 'ios' || text === null) return { room: 0, style: null };
  const flat: TextStyle = StyleSheet.flatten(style) ?? {};
  const own = flat.fontSize ?? size;
  const lineHeight = flat.lineHeight ?? tokenLineHeight;
  const room = markRoom(text, own, lineHeight) * scale;
  if (room === 0) return { room: 0, style: null };
  return {
    room,
    style: {
      paddingTop: points(flat.paddingTop, flat.paddingVertical, flat.padding) + room,
      marginTop: points(flat.marginTop, flat.marginVertical, flat.margin) - room,
    },
  };
}

/**
 * Room above a Borel line, as the design pads every guide line (4 at 15 pt): Borel's ascenders and
 * Vietnamese marks reach above the 1.5 line box the guide is set in.
 */
const BOREL_TOP_EM = 0.27;

function borelRoomStyle(
  size: number,
  scale: number,
  style: StyleProp<TextStyle>,
): { readonly room: number; readonly style: TextStyle } {
  const flat: TextStyle = StyleSheet.flatten(style) ?? {};
  const own = points(flat.paddingTop, flat.paddingVertical, flat.padding);
  const room = Math.round((flat.fontSize ?? size) * scale * BOREL_TOP_EM);
  return { room, style: { paddingTop: own + room } };
}

/**
 * Premium text: one type token per use, SF Pro (system) unless the token is the guide's voice or a
 * code. Dynamic Type scales it natively up to the token's cap, so display type never outgrows its
 * hero while body copy follows the phone.
 */
export function Text({
  variant = 'body',
  tone = 'ink',
  color,
  align,
  singleLine,
  style,
  onTextLayout,
  ...rest
}: PremiumTextProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { plainGuideText, fontScale } = useThemeSettings();
  const token = theme.type[variant];
  useReportBodyTitle(variant === 'largeTitle');
  const font = premiumFont(token, locale, plainGuideText);
  // A label in a fixed slot held to one line steps its size down a little to fit whole (a longer
  // language), as the system's segments do, instead of losing its end.
  const floor = LABEL_FIT_FLOOR[variant];
  const fit =
    rest.numberOfLines === 1 && floor !== undefined && rest.adjustsFontSizeToFit === undefined
      ? { adjustsFontSizeToFit: true, minimumFontScale: floor }
      : {};
  const plain = plainText(rest.children);
  // Prose wraps at full width with its last two words kept together; a control label, a code and
  // a one-line text are left as written.
  const tie =
    plain !== null &&
    rest.numberOfLines !== 1 &&
    token.family !== 'mono' &&
    !(singleLine ?? ONE_LINE_VARIANTS.has(variant));
  const text = tie ? tieLastWords(plain) : plain;
  const balanced = align === 'center' || BALANCED_VARIANTS.has(variant);
  // Android's balanced breaking evens the lines of a centred text or a heading; on a text set from
  // the start it narrowed a short note to half the width, so it keeps the full width there.
  const unbalanced =
    !balanced && rest.textBreakStrategy === 'balanced' ? { textBreakStrategy: UNBALANCED } : null;
  const scale = Math.min(fontScale, token.maxScale);
  const borel = token.family === 'guide' && font.fontFamily !== undefined;
  const marks = borel
    ? borelRoomStyle(token.size, scale, style)
    : markRoomStyle(text, token.size, token.lineHeight, scale, style);

  return (
    <RNText
      {...(balanced ? BALANCED : null)}
      {...fit}
      {...rest}
      {...unbalanced}
      {...(tie && text !== plain ? { children: text } : null)}
      allowFontScaling
      maxFontSizeMultiplier={token.maxScale}
      style={[
        {
          ...font,
          fontSize: token.size,
          letterSpacing: token.tracking,
          color: color ?? theme.color[tone],
        },
        token.lineHeight === undefined ? null : { lineHeight: token.lineHeight },
        token.family === 'mono' ? CAPS : null,
        align === undefined ? null : { textAlign: align },
        style,
        marks.style,
      ]}
      // Only where something reads it: line metrics sent to JS on every layout cost a bridge trip
      // per text (keyboard, sheet detents, list scroll), so store builds skip them.
      onTextLayout={
        UI_QA_ENABLED || onTextLayout !== undefined
          ? (event) => {
              if (UI_QA_ENABLED && text !== null) {
                const oneLine = singleLine ?? ONE_LINE_VARIANTS.has(variant);
                const problems = textLayoutProblems({
                  lines: event.nativeEvent.lines,
                  text,
                  // A caller's line limit makes its ellipsis intended, except on a control label: a
                  // button or pill that cuts its own label is clipped, whatever the limit says.
                  truncationIsBug: rest.numberOfLines === undefined || oneLine,
                  lineLimited: rest.numberOfLines !== undefined,
                  // Larger text sizes wrap labels by design (Dynamic Type).
                  singleLine: oneLine && fontScale <= 1,
                  // Borel's metrics aren't SF Pro's that the check reads; its room is fixed above.
                  marksClipped:
                    Platform.OS === 'ios' &&
                    !borel &&
                    event.nativeEvent.lines[0] !== undefined &&
                    marksClipped(text, event.nativeEvent.lines[0], marks.room),
                });
                for (const code of problems)
                  reportUiQa(code, rest.testID ?? text.slice(0, 40), variant);
              }
              onTextLayout?.(event);
            }
          : undefined
      }
    />
  );
}
