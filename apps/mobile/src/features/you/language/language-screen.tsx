/**
 * Settings › Language over the app's own locale switch: `setLocale` loads the language's words,
 * activates them in place and remembers the choice; the session reports it to the server
 * (`set_app_locale`), so the guide and notifications follow.
 */
import { useState } from 'react';

import { setLocale } from '@/lib/i18n/set-locale';
import { useLocale } from '@/lib/i18n/use-locale';

import { languageChoices } from './language-names';
import { LanguageView } from './language-view';

export function LanguageScreen({
  switchTo = (code: string) => setLocale(code),
}: {
  readonly switchTo?: (code: string) => Promise<void>;
}) {
  const current = useLocale();
  const [switching, setSwitching] = useState<string | null>(null);

  const pick = (code: string) => {
    if (code === current || switching !== null) return;
    setSwitching(code);
    void switchTo(code)
      .catch(() => undefined)
      .finally(() => setSwitching(null));
  };

  return (
    <LanguageView
      choices={languageChoices(current)}
      current={current}
      switching={switching}
      onPick={pick}
    />
  );
}
