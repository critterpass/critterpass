/**
 * Small previews of every app icon the app bundles, one per look (the baked icon's light, dark
 * and tinted renders at 180 px), for the icon picker and anywhere an icon is shown in the app.
 */
import type { AppIconBaseId } from '@cp/domain';
import type { ImageSourcePropType } from 'react-native';

import FACE_ANY from './previews/face-any.png';
import FACE_DARK from './previews/face-dark.png';
import FACE_TINTED from './previews/face-tinted.png';
import PASSPORT_ANY from './previews/passport-any.png';
import PASSPORT_DARK from './previews/passport-dark.png';
import PASSPORT_TINTED from './previews/passport-tinted.png';
import STAMP_ANY from './previews/stamp-any.png';
import STAMP_DARK from './previews/stamp-dark.png';
import STAMP_TINTED from './previews/stamp-tinted.png';
import STICKER_ANY from './previews/sticker-any.png';
import STICKER_DARK from './previews/sticker-dark.png';
import STICKER_TINTED from './previews/sticker-tinted.png';
import TEMPLE_ANY from './previews/temple-any.png';
import TEMPLE_DARK from './previews/temple-dark.png';
import TEMPLE_TINTED from './previews/temple-tinted.png';
import SARDI_ANY from './previews/sardi-any.png';
import SARDI_DARK from './previews/sardi-dark.png';
import SARDI_TINTED from './previews/sardi-tinted.png';
import HOME_SET_ANY from './previews/home-set-any.png';
import HOME_SET_DARK from './previews/home-set-dark.png';
import HOME_SET_TINTED from './previews/home-set-tinted.png';
import PON_ANY from './previews/pon-any.png';
import PON_DARK from './previews/pon-dark.png';
import PON_TINTED from './previews/pon-tinted.png';
import GOLDEN_ANY from './previews/golden-any.png';
import GOLDEN_DARK from './previews/golden-dark.png';
import GOLDEN_TINTED from './previews/golden-tinted.png';
import BALI_SIX_ANY from './previews/bali-six-any.png';
import BALI_SIX_DARK from './previews/bali-six-dark.png';
import BALI_SIX_TINTED from './previews/bali-six-tinted.png';

export type AppIconLook = 'any' | 'dark' | 'tinted';

export const APP_ICON_PREVIEWS: Readonly<
  Record<AppIconBaseId, Readonly<Record<AppIconLook, ImageSourcePropType>>>
> = {
  face: { any: FACE_ANY, dark: FACE_DARK, tinted: FACE_TINTED },
  passport: { any: PASSPORT_ANY, dark: PASSPORT_DARK, tinted: PASSPORT_TINTED },
  stamp: { any: STAMP_ANY, dark: STAMP_DARK, tinted: STAMP_TINTED },
  sticker: { any: STICKER_ANY, dark: STICKER_DARK, tinted: STICKER_TINTED },
  temple: { any: TEMPLE_ANY, dark: TEMPLE_DARK, tinted: TEMPLE_TINTED },
  sardi: { any: SARDI_ANY, dark: SARDI_DARK, tinted: SARDI_TINTED },
  'home-set': { any: HOME_SET_ANY, dark: HOME_SET_DARK, tinted: HOME_SET_TINTED },
  pon: { any: PON_ANY, dark: PON_DARK, tinted: PON_TINTED },
  golden: { any: GOLDEN_ANY, dark: GOLDEN_DARK, tinted: GOLDEN_TINTED },
  'bali-six': { any: BALI_SIX_ANY, dark: BALI_SIX_DARK, tinted: BALI_SIX_TINTED },
};
