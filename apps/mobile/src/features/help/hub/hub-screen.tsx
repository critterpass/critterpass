/**
 * The help hub over the phone's data: the synced articles (English when the language has none),
 * search through the api with the phone's copy as the fallback, and the tiles' destinations.
 */
import { applicationId } from 'expo-application';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';

import { searchHelpOnline, type SearchHelp } from '../data/help-api';
import { useIdeasToVote, useReplyChannel } from '../data/help-local';
import { hubArticles } from '../data/search-local';
import { storeReviewUrl } from '../data/store-review';
import { useHelpArticles } from '../data/use-help-articles';
import { useHelpSearch } from '../data/use-help-search';
import { articleHref, feedbackHref } from '../routes';
import { shakeToReportAvailable, useShakeToReport } from '../shake/shake-pref';
import { HubView } from './HubView';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route, never copy.
const SETTINGS_FALLBACK = '/you/settings';

export function HubScreen({ search = searchHelpOnline }: { readonly search?: SearchHelp }) {
  const params = useLocalSearchParams<{ context?: string }>();
  const context = typeof params.context === 'string' ? params.context : 'settings';
  const locale = useLocale();
  const [shakeOn] = useShakeToReport();
  const { articles, fallback, loaded } = useHelpArticles();
  const [query, setQuery] = useState('');
  const found = useHelpSearch({ query, locale, context, articles, search });
  const ideasToVote = useIdeasToVote();
  const repliesVia = useReplyChannel();
  const openReview = () => {
    const url = storeReviewUrl(Platform.OS, applicationId);
    if (url !== null) void Linking.openURL(url).catch(() => undefined);
  };
  return (
    <HubView
      guide="tokek"
      articles={hubArticles(articles, context)}
      englishFallback={fallback}
      articlesLoaded={loaded}
      query={query}
      onQuery={setQuery}
      searching={found.status === 'loading'}
      results={found.results}
      ideasToVote={ideasToVote}
      repliesVia={repliesVia}
      shakeToReport={shakeToReportAvailable() && shakeOn}
      onBack={() => goBackOr(SETTINGS_FALLBACK)}
      onReport={() => router.push(feedbackHref({ mode: 'problem', context }))}
      onFeedback={() => router.push(feedbackHref({ mode: 'feedback', context }))}
      onSuggest={() => router.push(feedbackHref({ mode: 'idea', context }))}
      onRate={openReview}
      onArticle={(slug) => router.push(articleHref(slug))}
      onAskHuman={() => router.push(feedbackHref({ mode: 'feedback', context }))}
    />
  );
}
