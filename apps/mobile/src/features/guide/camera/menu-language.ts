/**
 * The language pill of point and ask (3j-3): "INDONESIAN → ENGLISH", the menu's language as the
 * guide told it and the language the app is in. A language the app has no name for shows no pill.
 */
import { useLingui } from '@lingui/react/macro';

/** The base language of a BCP 47 tag ("vi-VN" → "vi"). */
function base(tag: string): string {
  return (tag.split('-')[0] ?? tag).toLowerCase();
}

export function useLanguageNames(): Readonly<Record<string, string>> {
  const { t } = useLingui();
  return {
    en: t({ id: 'guide.camera.lang.en', message: 'English' }),
    vi: t({ id: 'guide.camera.lang.vi', message: 'Vietnamese' }),
    id: t({ id: 'guide.camera.lang.id', message: 'Indonesian' }),
    ms: t({ id: 'guide.camera.lang.ms', message: 'Malay' }),
    th: t({ id: 'guide.camera.lang.th', message: 'Thai' }),
    ja: t({ id: 'guide.camera.lang.ja', message: 'Japanese' }),
    ko: t({ id: 'guide.camera.lang.ko', message: 'Korean' }),
    zh: t({ id: 'guide.camera.lang.zh', message: 'Chinese' }),
    km: t({ id: 'guide.camera.lang.km', message: 'Khmer' }),
    lo: t({ id: 'guide.camera.lang.lo', message: 'Lao' }),
    tl: t({ id: 'guide.camera.lang.tl', message: 'Filipino' }),
    pt: t({ id: 'guide.camera.lang.pt', message: 'Portuguese' }),
    es: t({ id: 'guide.camera.lang.es', message: 'Spanish' }),
    fr: t({ id: 'guide.camera.lang.fr', message: 'French' }),
    it: t({ id: 'guide.camera.lang.it', message: 'Italian' }),
    de: t({ id: 'guide.camera.lang.de', message: 'German' }),
  };
}

/** "Indonesian → English", or null when either side has no name or they are the same language. */
export function languagePair(
  names: Readonly<Record<string, string>>,
  source: string | null | undefined,
  reader: string,
): string | null {
  if (source === null || source === undefined) return null;
  const from = names[base(source)];
  const to = names[base(reader)];
  if (from === undefined || to === undefined || base(source) === base(reader)) return null;
  return `${from} → ${to}`;
}
