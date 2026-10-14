/**
 * A colour sticker icon from the design's sticker set (calendar, ticket, wallet, star, bowl, car,
 * chat, camera…): the hand-drawn art with its white edge, as the hub tiles (6.01), the add sheet
 * (1.06), settings and help rows (4.53, 9.06) draw it, where a line glyph would read flat. On a
 * `tile` it sits in a rounded square of that fill, as a row's leading art. Decorative: the row or
 * control holding it speaks.
 */
import { View } from 'react-native';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';
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
  readonly testID?: string;
}

/** The sticker's share of its tile. */
const ON_TILE = 0.78;

export function StickerIcon({ name, size = 40, tilt = 0, tile, testID }: StickerIconProps) {
  const t = usePremiumTheme();
  const art = tile === undefined ? size : Math.round(size * ON_TILE);
  const sticker = <CritterSticker kind={name} name={name} size={art} />;
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
