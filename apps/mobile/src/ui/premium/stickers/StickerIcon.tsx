/**
 * A colour sticker icon from the design's sticker set (calendar, ticket, wallet, star, bowl, car,
 * chat, camera…): the hand-drawn art with its white edge, as the hub tiles (6.01), the add sheet
 * (1.06), settings and help rows (4.53, 9.06) draw it, where a line glyph would read flat. On a
 * `tile` it sits in a rounded square of that fill, as a row's leading art. Decorative: the row or
 * control holding it speaks.
 */
import { View } from 'react-native';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { PremiumTheme } from '../theme/theme';
import { CritterSticker } from './CritterSticker';

/** The sticker set's object kinds (critter-art `kinds/icons`). */
export type StickerIconName =
  | 'bed'
  | 'bell'
  | 'boat'
  | 'cal'
  | 'camera'
  | 'car'
  | 'chat'
  | 'check'
  | 'egg'
  | 'flame'
  | 'food'
  | 'heart'
  | 'lock'
  | 'pin'
  | 'plane'
  | 'rain'
  | 'spark'
  | 'star'
  | 'sun'
  | 'temple'
  | 'ticket'
  | 'volcano'
  | 'wallet'
  | 'wave';

export interface StickerIconProps {
  readonly name: StickerIconName;
  /** The sticker's side, or the tile's when there is one. @default 40 */
  readonly size?: number;
  /** Degrees; stickers sit a little turned on tiles (6.01 tilts them 8°). */
  readonly tilt?: number;
  /** A rounded square of this fill behind the sticker (a row's leading tile). */
  readonly tile?: string;
  /** The sticker's colour. @default the colour the design gives that sticker */
  readonly color?: string;
  readonly testID?: string;
}

/** The sticker's share of its tile. */
const ON_TILE = 0.78;

type Accent = keyof PremiumTheme['accent'];

/**
 * Each sticker's colour in the design (6.01: a pink calendar, a blue ticket, a mint wallet, a sun
 * star; 9.06: a pink heart, a blue chat, a sun spark). The art set draws a bare outline otherwise.
 */
const STICKER_ACCENT: Readonly<Record<StickerIconName, Accent>> = {
  bed: 'tangerine',
  bell: 'sun',
  boat: 'sky',
  cal: 'pink',
  camera: 'pink',
  car: 'sun',
  chat: 'sky',
  check: 'mint',
  egg: 'sun',
  flame: 'tangerine',
  food: 'tangerine',
  heart: 'pink',
  lock: 'sun',
  pin: 'pink',
  plane: 'sky',
  rain: 'sky',
  spark: 'sun',
  star: 'sun',
  sun: 'sun',
  temple: 'tangerine',
  ticket: 'sky',
  volcano: 'tangerine',
  wallet: 'mint',
  wave: 'sky',
};

export function StickerIcon({ name, size = 40, tilt = 0, tile, color, testID }: StickerIconProps) {
  const t = usePremiumTheme();
  const art = tile === undefined ? size : Math.round(size * ON_TILE);
  const fill = color ?? t.accent[STICKER_ACCENT[name]];
  const sticker = (
    <CritterSticker
      kind={name}
      name={name}
      size={art}
      // Object stickers wash their shape in `accent`; the rest of the set reads the fills.
      form={{
        rarity: 'common',
        palette: { f: fill, dk: fill, bl: fill, accent: fill },
        edge: 'none',
      }}
    />
  );
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        tile === undefined ? null : { borderRadius: t.radius.dayBadge, backgroundColor: tile },
        tilt === 0 ? null : { transform: [{ rotate: `${String(tilt)}deg` }] },
      ]}
    >
      {sticker}
    </View>
  );
}
