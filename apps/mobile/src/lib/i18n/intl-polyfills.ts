/**
 * Hermes ships only `Intl.Collator`, `Intl.DateTimeFormat` and `Intl.NumberFormat`. Lingui resolves
 * every ICU `plural` and `selectordinal` message through `Intl.PluralRules`, so without it the first
 * plural string rendered ("3 votes") throws and a release build terminates. The polyfill installs
 * itself only where the engine lacks a working implementation (never under Node or Jest), and the
 * locale data covers the language of every locale in the `@cp/i18n` registry; a test keeps the two
 * lists in step.
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
