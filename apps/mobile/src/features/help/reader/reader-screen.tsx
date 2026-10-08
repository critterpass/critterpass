/**
 * An article from the phone's synced help centre, in the app's language or else in English.
 * "Was this helpful?" is counted once per answer and changes nothing else.
 */
/* eslint-disable lingui/no-unlocalized-strings -- analytics event names, never copy. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { useLocale } from '@/lib/i18n/use-locale';
import { useAnalytics } from '@/lib/analytics';

import { useHelpArticles } from '../data/use-help-articles';
import { articleHref, feedbackHref, HELP_ROUTES } from '../routes';
import { ReaderView } from './ReaderView';

export function ReaderScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const locale = useLocale();
  const analytics = useAnalytics();
  const { articles, loaded } = useHelpArticles();
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const found = articles.find((a) => a.slug === slug);
  const article =
    found === undefined
      ? loaded
        ? ('missing' as const)
        : null
      : { ...found, inEnglish: found.locale === 'en' && !locale.startsWith('en') };
  return (
    <ReaderView
      article={article}
      helpful={helpful}
      onHelpful={(answer) => {
        if (answer === helpful) return;
        setHelpful(answer);
        if (typeof slug === 'string') {
          analytics.capture('help_article_rated', { article: slug, helpful: answer });
        }
      }}
      onOpenArticle={(next) => router.push(articleHref(next))}
      onAskHuman={() =>
        router.push(feedbackHref({ mode: 'feedback', ...(slug ? { article: slug } : {}) }))
      }
      onBack={() => goBackOr(HELP_ROUTES.hub)}
    />
  );
}
