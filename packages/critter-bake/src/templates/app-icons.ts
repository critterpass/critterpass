import type { CardLayout, LayoutNode } from '@cp/critter-art/share';
import { card, rect, sticker, text } from '@cp/critter-art/share';
import type { FormSpec, Pose, RenderSpec } from '@cp/critter-art';
import { findDesignedForm } from '@cp/critter-art';
import { tokens } from '@cp/design-tokens';

/**
 * The 10 app icon identities: the 4 base styles (FACE/PASSPORT/STAMP/STICKER) plus 6 earned icons
 * (TEMPLE, SARDI, HOME SET, PON, GOLDEN, BALI SIX). Kebab-case ids double as the alternate-icon
 * name the icon switcher's Info.plist/`activity-alias` entries match against.
 */
export const APP_ICON_IDS = [
  'face',
  'passport',
  'stamp',
  'sticker',
  'temple',
  'sardi',
  'home-set',
  'pon',
  'golden',
  'bali-six',
] as const;

export type AppIconId = (typeof APP_ICON_IDS)[number];

/** The 4 base styles draw their own chrome (`buildAppIconContentLayout`); every earned icon reuses the sticker style with a swapped-in character and guide/tier accent. */
export type AppIconBaseStyle = 'face' | 'passport' | 'stamp' | 'sticker';

export interface AppIconCharacter {
  readonly kind: string;
  readonly pose: Pose;
  readonly seed: number;
  readonly form?: FormSpec;
}

export interface AppIconDefinition {
  readonly id: AppIconId;
  readonly baseStyle: AppIconBaseStyle;
  readonly character: AppIconCharacter;
  /** The icon's "Default"-appearance background fill (`docs/design-renders/App Icon.dc.html`'s light-mode `P[variant].light.bg`, or the guide/tier accent for earned icons). Icon Composer derives dark/tinted/clear appearances from this and each layer's own material properties — see phase report — so this is the only background colour this pipeline needs to pick. */
  readonly backgroundHex: string;
  /** Stamp-only city label (`design/App Icon.dc.html`'s hardcoded "HÀ NỘI", cp-001's real city per `@cp/critter-art`'s CritterDex data). */
  readonly label?: string;
  /** True when `character.form` comes from `@cp/critter-art`'s `DESIGNED_FORMS` (a named, founder-reviewed form) rather than this pipeline's own undesigned placeholder pick. */
  readonly designed: boolean;
  /** Rationale for an undesigned name→character mapping, surfaced verbatim in `docs/undesigned-states.md`. Unset for the 4 base styles and the 3 confirmed earned-icon mappings (temple/pon/golden — see `DESIGNED_FORMS`; sardi — direct guide-name match). */
  readonly note?: string;
}

const geckoIdle: AppIconCharacter = { kind: 'gecko', pose: 'idle', seed: 7 };

const templeForm = findDesignedForm('cp-112', 'rare');
const goldenForm = findDesignedForm('cp-112', 'legendary');
const sakuraPonForm = findDesignedForm('cp-061', 'legendary');

if (!templeForm || !goldenForm || !sakuraPonForm) {
  // `DESIGNED_FORMS` is a fixed, hand-authored list (`packages/critter-art/src/forms/designed.ts`)
  // this pipeline doesn't control — a missing entry here means that list changed shape, not a bad
  // manifest input, so this fails loudly at import time rather than silently drawing an undesigned
  // placeholder for an icon the phase spec says is a named, designed form.
  throw new Error(
    'app-icons: expected DESIGNED_FORMS to contain Temple Tokek (cp-112 rare), Golden Tokek ' +
      '(cp-112 legendary) and Sakura Pon (cp-061 legendary) — see packages/critter-art/src/forms/designed.ts',
  );
}

export const APP_ICONS: readonly AppIconDefinition[] = [
  {
    id: 'face',
    baseStyle: 'face',
    character: geckoIdle,
    backgroundHex: '#ffd84a',
    designed: false,
  },
  {
    id: 'passport',
    baseStyle: 'passport',
    character: geckoIdle,
    backgroundHex: '#17142a',
    designed: false,
  },
  {
    id: 'stamp',
    baseStyle: 'stamp',
    character: { kind: 'cp-001', pose: 'idle', seed: 1 },
    backgroundHex: '#f4efe4',
    label: 'HÀ NỘI',
    designed: false,
  },
  {
    id: 'sticker',
    baseStyle: 'sticker',
    character: { kind: 'gecko', pose: 'wave', seed: 7 },
    backgroundHex: '#17142a',
    designed: false,
  },
  {
    id: 'temple',
    baseStyle: 'sticker',
    character: {
      kind: 'gecko',
      pose: templeForm.form.pose ?? 'idle',
      seed: 7,
      form: templeForm.form,
    },
    backgroundHex: templeForm.form.palette.dk,
    designed: true,
  },
  {
    id: 'sardi',
    baseStyle: 'sticker',
    character: { kind: 'sardine', pose: 'idle', seed: 7 },
    backgroundHex: tokens.guide.sardi,
    designed: false,
  },
  {
    id: 'home-set',
    baseStyle: 'sticker',
    character: { kind: 'puffin', pose: 'idle', seed: 7 },
    backgroundHex: tokens.guide.lundi,
    designed: false,
    note:
      'No guide or CritterDex name matches "HOME SET" (docs/product-decisions.md §"Live guides" ' +
      'names Tokek/Pon/Lundi/Ajo/Sardi/Paco; none is "home"-themed, and no other doc names a ' +
      '"home set" achievement). Placeholder: Lundi (puffin) — the guide left over once ' +
      'temple/golden/bali-six (Tokek), pon (Pon) and sardi (Sardi) are assigned. Founder to confirm ' +
      'the real criteria and character before this ships as a real earned icon.',
  },
  {
    id: 'pon',
    baseStyle: 'sticker',
    character: {
      kind: 'tanuki',
      pose: sakuraPonForm.form.pose ?? 'cheer',
      seed: 7,
      form: sakuraPonForm.form,
    },
    backgroundHex: sakuraPonForm.form.palette.dk,
    designed: true,
  },
  {
    id: 'golden',
    baseStyle: 'sticker',
    character: {
      kind: 'gecko',
      pose: goldenForm.form.pose ?? 'idle',
      seed: 7,
      form: goldenForm.form,
    },
    backgroundHex: goldenForm.form.palette.dk,
    designed: true,
  },
  {
    id: 'bali-six',
    baseStyle: 'sticker',
    character: { kind: 'gecko', pose: 'point', seed: 7 },
    backgroundHex: tokens.guide.tokek,
    designed: false,
    note:
      '"BALI SIX" reads as a Bali milestone (docs/product-decisions.md: Tokek is Bali\'s guide) but ' +
      'no doc gives the actual "six" criteria (six temples? six common critters?) or a distinct ' +
      'character from golden/temple. Placeholder: common Tokek (gecko), "point" pose, Tokek\'s guide ' +
      'colour — distinguishable from temple (rare, idle) and golden (legendary, idle) by tier/pose ' +
      'only. Founder to confirm before this ships as a real earned icon.',
  },
];

function toRenderSpec(character: AppIconCharacter): RenderSpec {
  return {
    kind: character.kind,
    seed: character.seed,
    pose: character.pose,
    ...(character.form ? { form: character.form } : {}),
  };
}

const ICON_CANVAS = 1024;
// `design/App Icon.dc.html` lays out every variant in a 200x200 unit box; content-layer geometry
// below is that file's own pixel values times this scale, so the port is a direct, checkable
// transform rather than a re-guessed layout.
const DC_SCALE = ICON_CANVAS / 200;

function faceLayout(character: AppIconCharacter): readonly LayoutNode[] {
  return [sticker(-90 * DC_SCALE, -34 * DC_SCALE, 380 * DC_SCALE, toRenderSpec(character))];
}

function stickerLayout(character: AppIconCharacter): readonly LayoutNode[] {
  return [
    sticker(24 * DC_SCALE, 22 * DC_SCALE, 152 * DC_SCALE, toRenderSpec(character), {
      rotationDeg: -8,
    }),
  ];
}

// Passport chrome (design/App Icon.dc.html lines 25-35): cover + page card, both rotated, plus a
// circular photo. The vertical "PASSPORT" wordmark and the two 3-dot "hand" clusters are omitted —
// `RectNode`/`TextNode` (packages/critter-art/src/share/model.ts) have no dashed-border or
// tiny-rotated-glyph primitives, and reproducing them pixel-for-pixel isn't worth extending the
// shared card model for icon-only chrome this fine. Logged for the Playwright diff's documented
// tolerance, not silently dropped.
function passportLayout(character: AppIconCharacter): readonly LayoutNode[] {
  const cover = rect(34 * DC_SCALE, 92 * DC_SCALE, 132 * DC_SCALE, 150 * DC_SCALE, '#ff9a4d', {
    radius: 14 * DC_SCALE,
    rotationDeg: -2,
  });
  const page = rect(34 * DC_SCALE, 98 * DC_SCALE, 128 * DC_SCALE, 150 * DC_SCALE, '#f4efe4', {
    radius: 12 * DC_SCALE,
    rotationDeg: -4,
  });
  const photoDiameter = 42 * DC_SCALE;
  const photo = rect(
    76 * DC_SCALE - photoDiameter / 2,
    119 * DC_SCALE - photoDiameter / 2,
    photoDiameter,
    photoDiameter,
    '#ffd84a',
    { radius: photoDiameter / 2, rotationDeg: -4 },
  );
  return [cover, page, photo, sticker(0, 6 * DC_SCALE, 200 * DC_SCALE, toRenderSpec(character))];
}

// Stamp chrome (design/App Icon.dc.html lines 38-45): a ring around the cp-001 critter plus its
// real city label. The dashed inner border is simplified to a solid ring — same reasoning as the
// passport chrome above.
function stampLayout(
  character: AppIconCharacter,
  label: string | undefined,
): readonly LayoutNode[] {
  const ringOuterDiameter = 156 * DC_SCALE;
  const ringWidth = 8 * DC_SCALE;
  const ringInnerDiameter = ringOuterDiameter - ringWidth * 2;
  const center = 100 * DC_SCALE;
  const ringOuter = rect(
    center - ringOuterDiameter / 2,
    center - ringOuterDiameter / 2,
    ringOuterDiameter,
    ringOuterDiameter,
    '#ff5fa8',
    { radius: ringOuterDiameter / 2, rotationDeg: -9 },
  );
  const ringInner = rect(
    center - ringInnerDiameter / 2,
    center - ringInnerDiameter / 2,
    ringInnerDiameter,
    ringInnerDiameter,
    '#f4efe4',
    { radius: ringInnerDiameter / 2, rotationDeg: -9 },
  );
  const critterSize = 92 * DC_SCALE;
  const critter = sticker(
    center - critterSize / 2,
    center - critterSize / 2 - 10 * DC_SCALE,
    critterSize,
    toRenderSpec(character),
  );
  const nodes: LayoutNode[] = [ringOuter, ringInner, critter];
  if (label) {
    nodes.push(
      text(
        center - 90 * DC_SCALE,
        center + 48 * DC_SCALE,
        180 * DC_SCALE,
        label,
        { fontFamily: 'Archivo', fontWeight: 800, color: '#ff5fa8', fontSize: 15 * DC_SCALE },
        { align: 'center' },
      ),
    );
  }
  return nodes;
}

/**
 * The icon's transparent content layer(s): everything Icon Composer/Android composite on top of
 * the flat `backgroundHex` fill (this pipeline's writers own the background — see
 * `writers/app-icon-ios.ts`/`writers/app-icon-android.ts`). 1024x1024, matching the flat-fallback
 * export size 1:1 so no extra resampling step exists between "what we drew" and "what ships".
 */
export function buildAppIconContentLayout(def: AppIconDefinition): CardLayout {
  const nodes =
    def.baseStyle === 'face'
      ? faceLayout(def.character)
      : def.baseStyle === 'passport'
        ? passportLayout(def.character)
        : def.baseStyle === 'stamp'
          ? stampLayout(def.character, def.label)
          : stickerLayout(def.character);
  return card(ICON_CANVAS, ICON_CANVAS, nodes, 'transparent');
}

export { ICON_CANVAS };
