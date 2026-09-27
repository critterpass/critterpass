import type { Messages } from '@lingui/core';

import { catalogs as locale_en } from './en.js';
import { catalogs as locale_zh_Hans } from './zh-Hans.js';
import { catalogs as locale_id } from './id.js';
import { catalogs as locale_ja } from './ja.js';
import { catalogs as locale_es } from './es.js';
import { catalogs as locale_pt } from './pt.js';
import { catalogs as locale_fr } from './fr.js';
import { catalogs as locale_ko } from './ko.js';
import { catalogs as locale_th } from './th.js';
import { catalogs as locale_vi } from './vi.js';
import { catalogs as locale_de } from './de.js';
import { catalogs as locale_it } from './it.js';
import { catalogs as locale_nl } from './nl.js';
import { catalogs as locale_tr } from './tr.js';
import { catalogs as locale_ms } from './ms.js';
import { catalogs as locale_pl } from './pl.js';
import { catalogs as locale_en_XA } from './en-XA.js';

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
