/**
 * Small previews of every app icon the app bundles, one per look (light, dark, clear and tinted
 * at 180 px, baked from each icon's Icon Composer layers), for the icon picker and anywhere an
 * icon is shown in the app. An icon the app does not bundle has no preview; the picker lists only
 * the ones here.
 */
import type { AppIconBaseId } from '@cp/domain';
import type { ImageSourcePropType } from 'react-native';

import FACE_ANY from './previews/face-any.png';
import FACE_CLEAR from './previews/face-clear.png';
import FACE_DARK from './previews/face-dark.png';
import FACE_TINTED from './previews/face-tinted.png';
import PASSPORT_ANY from './previews/passport-any.png';
import PASSPORT_CLEAR from './previews/passport-clear.png';
import PASSPORT_DARK from './previews/passport-dark.png';
import PASSPORT_TINTED from './previews/passport-tinted.png';
import STAMP_ANY from './previews/stamp-any.png';
import STAMP_CLEAR from './previews/stamp-clear.png';
import STAMP_DARK from './previews/stamp-dark.png';
import STAMP_TINTED from './previews/stamp-tinted.png';
import STICKER_ANY from './previews/sticker-any.png';
import STICKER_CLEAR from './previews/sticker-clear.png';
import STICKER_DARK from './previews/sticker-dark.png';
import STICKER_TINTED from './previews/sticker-tinted.png';

export type AppIconLook = 'any' | 'dark' | 'clear' | 'tinted';

export const APP_ICON_PREVIEWS: Readonly<
  Partial<Record<AppIconBaseId, Readonly<Record<AppIconLook, ImageSourcePropType>>>>
> = {
  face: { any: FACE_ANY, dark: FACE_DARK, clear: FACE_CLEAR, tinted: FACE_TINTED },
  passport: {
    any: PASSPORT_ANY,
    dark: PASSPORT_DARK,
    clear: PASSPORT_CLEAR,
    tinted: PASSPORT_TINTED,
  },
  stamp: { any: STAMP_ANY, dark: STAMP_DARK, clear: STAMP_CLEAR, tinted: STAMP_TINTED },
  sticker: { any: STICKER_ANY, dark: STICKER_DARK, clear: STICKER_CLEAR, tinted: STICKER_TINTED },
};
