/**
 * Hermes ships only `Intl.Collator`, `Intl.DateTimeFormat` and `Intl.NumberFormat`. The app also
 * needs three more:
 * - `Intl.PluralRules`: Lingui resolves every ICU `plural` and `selectordinal` message through it,
 *   so the first plural string rendered ("3 votes") threw and a release build terminated.
 * - `Intl.RelativeTimeFormat`: staleness captions ("updated 5 minutes ago") and `format.relativeTime`.
 * - `Intl.ListFormat`: `format.list` ("Maya, Jordan and Winston").
 * Each polyfill installs itself only where the engine lacks a working implementation (never under
 * Node or Jest), and each carries data for the language of every locale in the `@cp/i18n` registry;
 * a test keeps the lists in step. PluralRules loads first: RelativeTimeFormat picks its plural
 * category through it.
 */
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/de.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/es.js';
import '@formatjs/intl-pluralrules/locale-data/fr.js';
import '@formatjs/intl-pluralrules/locale-data/id.js';
import '@formatjs/intl-pluralrules/locale-data/it.js';
import '@formatjs/intl-pluralrules/locale-data/ja.js';
import '@formatjs/intl-pluralrules/locale-data/ko.js';
import '@formatjs/intl-pluralrules/locale-data/ms.js';
import '@formatjs/intl-pluralrules/locale-data/nl.js';
import '@formatjs/intl-pluralrules/locale-data/pl.js';
import '@formatjs/intl-pluralrules/locale-data/pt.js';
import '@formatjs/intl-pluralrules/locale-data/th.js';
import '@formatjs/intl-pluralrules/locale-data/tr.js';
import '@formatjs/intl-pluralrules/locale-data/vi.js';
import '@formatjs/intl-pluralrules/locale-data/zh.js';

import '@formatjs/intl-relativetimeformat/polyfill.js';
import '@formatjs/intl-relativetimeformat/locale-data/de.js';
import '@formatjs/intl-relativetimeformat/locale-data/en.js';
import '@formatjs/intl-relativetimeformat/locale-data/es.js';
import '@formatjs/intl-relativetimeformat/locale-data/fr.js';
import '@formatjs/intl-relativetimeformat/locale-data/id.js';
import '@formatjs/intl-relativetimeformat/locale-data/it.js';
import '@formatjs/intl-relativetimeformat/locale-data/ja.js';
import '@formatjs/intl-relativetimeformat/locale-data/ko.js';
import '@formatjs/intl-relativetimeformat/locale-data/ms.js';
import '@formatjs/intl-relativetimeformat/locale-data/nl.js';
import '@formatjs/intl-relativetimeformat/locale-data/pl.js';
import '@formatjs/intl-relativetimeformat/locale-data/pt.js';
import '@formatjs/intl-relativetimeformat/locale-data/th.js';
import '@formatjs/intl-relativetimeformat/locale-data/tr.js';
import '@formatjs/intl-relativetimeformat/locale-data/vi.js';
import '@formatjs/intl-relativetimeformat/locale-data/zh.js';

import '@formatjs/intl-listformat/polyfill.js';
import '@formatjs/intl-listformat/locale-data/de.js';
import '@formatjs/intl-listformat/locale-data/en.js';
import '@formatjs/intl-listformat/locale-data/es.js';
import '@formatjs/intl-listformat/locale-data/fr.js';
import '@formatjs/intl-listformat/locale-data/id.js';
import '@formatjs/intl-listformat/locale-data/it.js';
import '@formatjs/intl-listformat/locale-data/ja.js';
import '@formatjs/intl-listformat/locale-data/ko.js';
import '@formatjs/intl-listformat/locale-data/ms.js';
import '@formatjs/intl-listformat/locale-data/nl.js';
import '@formatjs/intl-listformat/locale-data/pl.js';
import '@formatjs/intl-listformat/locale-data/pt.js';
import '@formatjs/intl-listformat/locale-data/th.js';
import '@formatjs/intl-listformat/locale-data/tr.js';
import '@formatjs/intl-listformat/locale-data/vi.js';
import '@formatjs/intl-listformat/locale-data/zh.js';
