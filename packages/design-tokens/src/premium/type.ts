/**
 * Premium type scale (foundations-spec.md §3, §6). SF Pro is the system font: `family: 'system'`
 * leaves `fontFamily` unset so iOS picks SF Pro Text or Display by size (Roboto on Android). Tracking
 * is converted from em to pt (size × em). `lineHeight` is set only where the design sets one; the
 * rest keep the font's natural line box, which is what the design's `normal` renders.
 *
 * `maxScale` caps Dynamic Type for the style: big display type stops growing early so it never
 * wraps a hero, body copy follows the OS up to the app-wide 2× cap.
 */

export type PremiumFontFamily = 'system' | 'guide' | 'mono';

export type PremiumFontWeight = '400' | '500' | '600' | '700' | '800';

export interface PremiumTypeStyle {
  readonly family: PremiumFontFamily;
  readonly size: number;
  readonly weight: PremiumFontWeight;
  /** Letter spacing in pt (already size × em). */
  readonly tracking: number;
  readonly lineHeight?: number;
  readonly maxScale: number;
}

const BODY_MAX_SCALE = 2;
const CONTROL_MAX_SCALE = 1.5;
const TITLE_MAX_SCALE = 1.3;
const DISPLAY_MAX_SCALE = 1.15;

function style(
  size: number,
  weight: PremiumFontWeight,
  em: number,
  maxScale: number,
  extra: { readonly family?: PremiumFontFamily; readonly lineHeight?: number } = {},
): PremiumTypeStyle {
  // Rounded to 1/100 pt so -0.05em on 66 reads -3.3, not -3.3000000000000003.
  const tracking = Math.round(size * em * 100) / 100;
  return {
    family: extra.family ?? 'system',
    size,
    weight,
    tracking: tracking === 0 ? 0 : tracking,
    ...(extra.lineHeight === undefined ? {} : { lineHeight: extra.lineHeight }),
    maxScale,
  };
}

export const premiumType = {
  hero: style(66, '800', -0.05, 1),
  display: style(34, '700', -0.03, DISPLAY_MAX_SCALE),
  largeTitle: style(32, '700', -0.03, TITLE_MAX_SCALE),
  emptyTitle: style(26, '700', -0.025, TITLE_MAX_SCALE),
  stat: style(26, '800', -0.035, TITLE_MAX_SCALE),
  title: style(22, '700', -0.02, TITLE_MAX_SCALE),
  navTitle: style(19, '700', 0, TITLE_MAX_SCALE),
  navSubtitle: style(12, '400', 0, CONTROL_MAX_SCALE),
  button: style(17, '600', -0.01, CONTROL_MAX_SCALE),
  headline: style(16, '600', 0, BODY_MAX_SCALE),
  field: style(16, '500', 0, BODY_MAX_SCALE),
  stepperValue: style(16, '700', 0, CONTROL_MAX_SCALE),
  body: style(15, '400', 0, BODY_MAX_SCALE),
  rowTitle: style(15, '600', 0, BODY_MAX_SCALE),
  textButton: style(15, '600', 0, CONTROL_MAX_SCALE),
  glassTitle: style(15, '600', 0, CONTROL_MAX_SCALE),
  toast: style(14.5, '600', 0, BODY_MAX_SCALE),
  rowText: style(14, '400', 0, BODY_MAX_SCALE),
  rowTextStrong: style(14, '600', 0, BODY_MAX_SCALE),
  buttonSmall: style(14, '600', 0, CONTROL_MAX_SCALE),
  emptyLine: style(14, '400', 0, BODY_MAX_SCALE, { lineHeight: 20.3 }),
  placeTag: style(14, '800', 0, CONTROL_MAX_SCALE),
  label: style(13, '600', 0, BODY_MAX_SCALE),
  segment: style(13, '600', 0, CONTROL_MAX_SCALE),
  pillSmall: style(13, '600', 0, CONTROL_MAX_SCALE),
  bannerAction: style(13, '700', 0, CONTROL_MAX_SCALE),
  note: style(13, '400', 0, BODY_MAX_SCALE, { lineHeight: 17.55 }),
  avatarInitial: style(13, '700', 0, 1),
  avatarInitialSmall: style(12, '700', 0, 1),
  avatarInitialLarge: style(14, '700', 0, 1),
  errorMark: style(14, '800', 0, 1),
  caption: style(12.5, '500', 0, BODY_MAX_SCALE),
  noteAction: style(12.5, '600', 0, CONTROL_MAX_SCALE),
  captionMuted: style(12, '400', 0, BODY_MAX_SCALE),
  helper: style(12, '600', 0, BODY_MAX_SCALE),
  statLabel: style(12, '600', 0, CONTROL_MAX_SCALE),
  progressLabel: style(12, '600', 0, CONTROL_MAX_SCALE),
  badge: style(11.5, '600', 0, CONTROL_MAX_SCALE),
  glassSubtitle: style(11, '400', 0, CONTROL_MAX_SCALE),
  tier: style(11, '700', 0, CONTROL_MAX_SCALE),
  dayBadgeDay: style(17, '800', 0, 1, { lineHeight: 17 }),
  dayBadgeWeekday: style(9.5, '700', 0, 1),
  stampWord: style(20, '800', 0, 1),
  stampCode: style(18, '800', 0, 1),
  stampSmall: style(8, '800', 0.14, 1),
  stampRect: style(22, '800', 0, 1),
  guide: style(15, '400', 0, BODY_MAX_SCALE, { family: 'guide' }),
  guideName: style(12, '400', 0, CONTROL_MAX_SCALE, { family: 'guide' }),
  mono: style(12, '500', 0.12, CONTROL_MAX_SCALE, { family: 'mono' }),
} as const satisfies Record<string, PremiumTypeStyle>;

export type PremiumTypeName = keyof typeof premiumType;
