import type { Messages } from '@lingui/core';

import { catalogs as locale_en } from './mobile/en';
import { catalogs as locale_zh_Hans } from './mobile/zh-Hans';
import { catalogs as locale_id } from './mobile/id';
import { catalogs as locale_ja } from './mobile/ja';
import { catalogs as locale_es } from './mobile/es';
import { catalogs as locale_pt } from './mobile/pt';
import { catalogs as locale_fr } from './mobile/fr';
import { catalogs as locale_ko } from './mobile/ko';
import { catalogs as locale_th } from './mobile/th';
import { catalogs as locale_vi } from './mobile/vi';
import { pseudoCatalogs } from './mobile/pseudo';

/** The app's registry: shipped locales and app catalogs only (see the generator). */
export const catalogRegistry: Record<string, Record<string, () => Promise<Messages>>> = {
  "en": locale_en,
  "zh-Hans": locale_zh_Hans,
  "id": locale_id,
  "ja": locale_ja,
  "es": locale_es,
  "pt": locale_pt,
  "fr": locale_fr,
  "ko": locale_ko,
  "th": locale_th,
  "vi": locale_vi,
  ...pseudoCatalogs,
};
