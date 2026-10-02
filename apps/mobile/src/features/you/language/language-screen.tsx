/**
 * Settings › Language over the app's own locale switch: `setLocale` loads the language's words,
 * activates them in place and remembers the choice; the session reports it to the server
 * (`set_app_locale`), so the guide and notifications follow.
 */
import { getLocales } from 'expo-localization';
import { useState } from 'react';

import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';

import { featuredLanguages, languageChoices } from './language-names';
import { LanguageView } from './language-view';

export function LanguageScreen({
  switchTo = (code: string) => setLocale(code),
  deviceLanguages = getLocales().map((locale) => locale.languageTag),
}: {
  readonly switchTo?: (code: string) => Promise<void>;
  readonly deviceLanguages?: readonly string[];
}) {
  const current = useLocale();
  const [switching, setSwitching] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const { featured, more } = featuredLanguages(languageChoices(current), deviceLanguages);

  const pick = (code: string) => {
    if (code === current || switching !== null) return;
    setSwitching(code);
    void switchTo(code)
      .catch(() => undefined)
      .finally(() => setSwitching(null));
  };

  return (
    <LanguageView
      featured={featured}
      more={more}
      showMore={showMore}
      onShowMore={() => setShowMore(true)}
      current={current}
      switching={switching}
      onPick={pick}
    />
  );
}
