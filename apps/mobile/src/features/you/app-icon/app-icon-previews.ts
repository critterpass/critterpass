/**
 * Small previews of every app icon the app bundles, one per look (the baked icon's light, dark
 * and tinted renders at 180 px), for the icon picker and anywhere an icon is shown in the app.
 * An icon the app does not bundle has no preview; the picker lists only the ones here.
 */
import type { AppIconBaseId } from '@cp/domain';
import type { ImageSourcePropType } from 'react-native';

import FACE_ANY from './previews/face-any.png';
import FACE_DARK from './previews/face-dark.png';
import FACE_TINTED from './previews/face-tinted.png';
import PASSPORT_ANY from './previews/passport-any.png';
import PASSPORT_DARK from './previews/passport-dark.png';
import PASSPORT_TINTED from './previews/passport-tinted.png';
import PON_ANY from './previews/pon-any.png';
import PON_DARK from './previews/pon-dark.png';
import PON_TINTED from './previews/pon-tinted.png';
import SARDI_ANY from './previews/sardi-any.png';
import SARDI_DARK from './previews/sardi-dark.png';
import SARDI_TINTED from './previews/sardi-tinted.png';
import TEMPLE_ANY from './previews/temple-any.png';
import TEMPLE_DARK from './previews/temple-dark.png';
import TEMPLE_TINTED from './previews/temple-tinted.png';

export type AppIconLook = 'any' | 'dark' | 'tinted';

export const APP_ICON_PREVIEWS: Readonly<
  Partial<Record<AppIconBaseId, Readonly<Record<AppIconLook, ImageSourcePropType>>>>
> = {
  face: { any: FACE_ANY, dark: FACE_DARK, tinted: FACE_TINTED },
  passport: { any: PASSPORT_ANY, dark: PASSPORT_DARK, tinted: PASSPORT_TINTED },
  pon: { any: PON_ANY, dark: PON_DARK, tinted: PON_TINTED },
  sardi: { any: SARDI_ANY, dark: SARDI_DARK, tinted: SARDI_TINTED },
  temple: { any: TEMPLE_ANY, dark: TEMPLE_DARK, tinted: TEMPLE_TINTED },
};
