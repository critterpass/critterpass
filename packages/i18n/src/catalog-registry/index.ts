import type { Messages } from '@lingui/core';

import { catalogs as locale_en } from './en';
import { catalogs as locale_zh_Hans } from './zh-Hans';
import { catalogs as locale_id } from './id';
import { catalogs as locale_ja } from './ja';
import { catalogs as locale_es } from './es';
import { catalogs as locale_pt } from './pt';
import { catalogs as locale_fr } from './fr';
import { catalogs as locale_ko } from './ko';
import { catalogs as locale_th } from './th';
import { catalogs as locale_vi } from './vi';
import { catalogs as locale_de } from './de';
import { catalogs as locale_it } from './it';
import { catalogs as locale_nl } from './nl';
import { catalogs as locale_tr } from './tr';
import { catalogs as locale_ms } from './ms';
import { catalogs as locale_pl } from './pl';
import { catalogs as locale_en_XA } from './en-XA';

/** Locale code -> catalog name -> loader, generated from the locale registry and the extracted `.po` catalogs. */
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
  "de": locale_de,
  "it": locale_it,
  "nl": locale_nl,
  "tr": locale_tr,
  "ms": locale_ms,
  "pl": locale_pl,
  "en-XA": locale_en_XA,
};
