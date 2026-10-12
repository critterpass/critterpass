import { Children } from 'react';
import type { ReactNode } from 'react';
import { Text as RNText } from 'react-native';
import type { TextProps as RNTextProps, TextStyle } from 'react-native';

import type { PremiumPalette, PremiumTypeName, PremiumTypeStyle } from '@cp/design-tokens';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';
import { textLayoutProblems } from '@/ui/qa/text-layout-check';
import { reportUiQa, UI_QA_ENABLED } from '@/ui/qa/ui-qa';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

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
/** The smallest a one-line label shrinks to before it is cut. */
const LABEL_FIT_FLOOR = 0.75;

const ONE_LINE_VARIANTS: ReadonlySet<PremiumTypeName> = new Set<PremiumTypeName>([
  'button',
  'buttonSmall',
  'textButton',
  'glassTitle',
  'segment',
  'pillSmall',
  'badge',
  'toastAction',
  'bannerAction',
  'noteAction',
  'placeTag',
  'tier',
]);

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
  const font = premiumFont(token, locale, plainGuideText);
  // A one-line label held to one line steps its size down to fit whole (a longer language, a
  // narrow pill or segment), as the system's controls do, instead of losing its end.
  const fit =
    rest.numberOfLines === 1 &&
    ONE_LINE_VARIANTS.has(variant) &&
    rest.adjustsFontSizeToFit === undefined
      ? { adjustsFontSizeToFit: true, minimumFontScale: LABEL_FIT_FLOOR }
      : {};

  return (
    <RNText
      {...fit}
      {...rest}
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
        align === undefined ? null : { textAlign: align },
        style,
      ]}
      onTextLayout={(event) => {
        const text = UI_QA_ENABLED ? plainText(rest.children) : null;
        if (text !== null) {
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
          });
          for (const code of problems) reportUiQa(code, rest.testID ?? text.slice(0, 40), variant);
        }
        onTextLayout?.(event);
      }}
    />
  );
}
