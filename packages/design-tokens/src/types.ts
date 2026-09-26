/**
 * The public, hand-written shape of the resolved token tree. `validate.ts` builds this tree at
 * runtime from the DTCG source and casts it once to `Tokens`, backed by per-leaf zod validation
 * (schema.ts) and the structural assertions in test/schema.test.ts.
 */
import type { z } from 'zod';

import type { tokenSchemas } from './schema.js';
import type { TypographyValue } from './type-variant.js';

type Infer<K extends keyof typeof tokenSchemas> = z.infer<(typeof tokenSchemas)[K]>;

export interface ColorInkTokens {
  readonly '950': string;
  readonly '930': string;
  readonly '900': string;
  readonly '850': string;
  readonly '800': string;
  readonly '780': string;
  readonly '700': string;
  readonly '600': string;
  readonly '400': string;
  readonly '300': string;
  readonly '200': string;
  readonly '100': string;
}

export interface ColorTokens {
  readonly ink: ColorInkTokens;
  readonly paper: { readonly base: string; readonly bright: string; readonly warm: string; readonly ink: string; readonly muted: string };
  readonly rust: { readonly base: string; readonly darkened: string };
  readonly yellow: string;
  readonly orange: string;
  readonly pink: string;
  readonly blue: string;
  readonly green: { readonly base: string; readonly deep: string };
  readonly gold: { readonly base: string; readonly dark: string; readonly silhouette: string };
  readonly map: { readonly base: string; readonly parksWater: string };
  readonly divider: string;
  readonly scrim: Infer<'cpAlphaRange'>;
  readonly flash: string;
}

export interface SemanticTokens {
  readonly bg: { readonly base: string; readonly raised: string; readonly control: string; readonly sunken: string };
  readonly surface: {
    readonly document: Infer<'cpSurface'>;
    readonly celebrate: Infer<'cpSurface'>;
    readonly alert: { readonly pink: Infer<'cpSurface'>; readonly orange: Infer<'cpSurface'> };
  };
  readonly text: { readonly primary: string; readonly secondary: string; readonly onAccent: string; readonly tertiary: string };
  readonly border: { readonly control: string; readonly decorative: string };
  readonly action: { readonly primary: string };
  readonly state: { readonly success: string; readonly urgent: string; readonly warning: string; readonly info: string };
  readonly brand: { readonly passplus: string; readonly boost: string };
  readonly increaseContrast: { readonly borderControl: string; readonly textTertiary: string };
}

export type GuideId = 'tokek' | 'pon' | 'lundi' | 'ajo' | 'sardi' | 'paco';

export interface GuideTokens {
  readonly order: readonly GuideId[];
  readonly tokek: string;
  readonly pon: string;
  readonly lundi: string;
  readonly ajo: string;
  readonly sardi: string;
  readonly paco: string;
  readonly onPaper: { readonly tokek: string; readonly pon: string; readonly lundi: string; readonly ajo: string; readonly sardi: string; readonly paco: string };
}

export interface TierTokens {
  readonly common: Infer<'cpTier'>;
  readonly rare: Infer<'cpTier'>;
  readonly epic: Infer<'cpTier'>;
  readonly legendary: Infer<'cpTier'>;
  readonly locked: { readonly default: string; readonly legendary: Infer<'cpTierLocked'> };
}

export interface MemberTokens {
  readonly colors: readonly string[];
  readonly ringPatterns: readonly string[];
}

export type SpaceStep = '2' | '4' | '6' | '8' | '10' | '12' | '14' | '16' | '20' | '24' | '32';
export type SpaceTokens = { readonly [K in SpaceStep]: number };

export interface SizeTokens {
  readonly gutter: number;
  readonly cardInner: Infer<'cpRange'>;
  readonly cta: { readonly bottom: number; readonly gap: number };
  readonly tabbar: number;
  readonly primaryCta: Infer<'cpSizeGroup'>;
  readonly headerPill: Infer<'cpSizeGroup'>;
  readonly chip: Infer<'cpSizeGroup'>;
  readonly otpBox: Infer<'cpSizeGroup'>;
  readonly toggle: Infer<'cpSizeGroup'>;
  readonly avatar: Infer<'cpSizeGroup'>;
  readonly fab: Infer<'cpSizeGroup'>;
  readonly minTouchTarget: Infer<'cpSizeGroup'>;
}

export interface RadiusTokens {
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly cardBig: number;
  readonly sheetTop: number;
  readonly heroBottom: number;
  readonly pill: string;
  readonly circle: string;
  readonly chatBubble: { readonly theirs: Infer<'cpCornerSet'>; readonly mine: Infer<'cpCornerSet'> };
  readonly ticketStub: Infer<'cpCornerSet'>;
}

export interface RingTokens {
  readonly cutout: Infer<'cpRing'>;
  readonly selected: Infer<'cpDoubleRing'>;
  readonly focus: Infer<'cpRing'>;
  readonly input: { readonly idle: Infer<'cpRing'>; readonly valid: Infer<'cpRing'>; readonly error: Infer<'cpRing'> };
  readonly glowFeedback: Infer<'cpGlow'>;
}

export type ShadowValue = Infer<'shadow'>;
export interface ShadowTokens {
  readonly sheet: ShadowValue;
  readonly float: ShadowValue;
  readonly paper: ShadowValue;
  readonly hard: ShadowValue;
  readonly sticker: ShadowValue;
}

export type TextureValue = Infer<'cpTexture'>;
export interface TextureTokens {
  readonly halftone: TextureValue;
  readonly halftoneDark: TextureValue;
  readonly guilloche: TextureValue;
  readonly hatch: TextureValue;
  readonly engraving: TextureValue;
  readonly barcode: TextureValue;
  readonly rays: TextureValue;
  readonly holo: TextureValue;
  readonly sheen: TextureValue;
}

export interface TypeTokens {
  readonly display: { readonly mega: TypographyValue; readonly hero: TypographyValue; readonly xl: TypographyValue };
  readonly h1: TypographyValue;
  readonly h2: TypographyValue;
  readonly h3: TypographyValue;
  readonly title: TypographyValue;
  readonly button: { readonly lg: TypographyValue; readonly sm: TypographyValue };
  readonly eyebrow: TypographyValue;
  readonly label: TypographyValue;
  readonly body: { readonly lg: TypographyValue; readonly base: TypographyValue; readonly sm: TypographyValue };
  readonly rowTitle: TypographyValue;
  readonly caption: TypographyValue;
  readonly input: { readonly base: TypographyValue; readonly otp: TypographyValue };
  readonly mono: { readonly data: TypographyValue };
  readonly voice: { readonly base: TypographyValue; readonly postcard: TypographyValue; readonly signature: TypographyValue };
}

export type CubicBezier = Infer<'cubicBezier'>;
export type SpringValue = Infer<'cpSpring'>;
export type TransitionValue = Infer<'cpTransition'>;

export interface MotionTokens {
  readonly duration: {
    readonly instant: number;
    readonly fast: number;
    readonly base: number;
    readonly medium: number;
    readonly slow: number;
    readonly extra: number;
    readonly story: number;
    readonly stagger: { readonly tight: number; readonly rows: number; readonly cards: number; readonly stamps: number };
  };
  readonly easing: {
    readonly standard: CubicBezier;
    readonly enter: CubicBezier;
    readonly exit: CubicBezier;
    readonly inOut: CubicBezier;
    readonly slam: CubicBezier;
    readonly gesture: CubicBezier;
    readonly press: CubicBezier;
    readonly back: CubicBezier;
    readonly burst: CubicBezier;
    readonly island: CubicBezier;
  };
  readonly spring: { readonly snappy: SpringValue; readonly bouncy: SpringValue; readonly gentle: SpringValue; readonly soft: SpringValue; readonly sheet: SpringValue };
  readonly transition: {
    readonly push: TransitionValue;
    readonly sheet: TransitionValue;
    readonly rise: TransitionValue;
    readonly zoom: TransitionValue;
    readonly burst: TransitionValue;
    readonly fold: TransitionValue;
    readonly flip: TransitionValue;
    readonly tab: TransitionValue;
    readonly fade: TransitionValue;
  };
  readonly gesture: {
    readonly tapCancelPt: number;
    readonly longPressMs: number;
    readonly edgeSwipe: { readonly startXPt: number; readonly commitDxPt: number; readonly commitVelocityPtMs: number; readonly settleMs: number; readonly settleEasing: CubicBezier };
    readonly dragDismiss: { readonly grabZoneSheetPt: number; readonly grabZoneRisePt: number; readonly commitDyPt: number; readonly commitVelocityPtMs: number };
    readonly press: { readonly scaleNarrow: number; readonly scaleMedium: number; readonly scaleWide: number; readonly durationMs: number; readonly releaseOvershoot: number; readonly releaseDurationMs: number };
  };
}

export type SoundCueValue = Infer<'cpSound'>;
export interface SoundTokens {
  readonly cue: { readonly [cueId: string]: SoundCueValue };
}

export interface Tokens {
  readonly color: ColorTokens;
  readonly semantic: SemanticTokens;
  readonly guide: GuideTokens;
  readonly tier: TierTokens;
  readonly member: MemberTokens;
  readonly space: SpaceTokens;
  readonly size: SizeTokens;
  readonly radius: RadiusTokens;
  readonly ring: RingTokens;
  readonly shadow: ShadowTokens;
  readonly texture: TextureTokens;
  readonly type: TypeTokens;
  readonly motion: MotionTokens;
  readonly sound: SoundTokens;
}
