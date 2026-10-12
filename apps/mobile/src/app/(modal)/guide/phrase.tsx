import { useLocalSearchParams } from 'expo-router';

import { ShowMode } from '@/features/guide/phrases/show-mode';
import { PremiumPhraseShowScreen } from '@/features/guide/premium/phrases/phrase-show-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentPhraseShowRoute() {
  const params = useLocalSearchParams<{
    phrase?: string;
    lang?: string;
    gloss?: string;
    practise?: string;
    tripId?: string;
  }>();
  return (
    <ShowMode
      phrase={params.phrase ?? ''}
      lang={params.lang ?? 'en'}
      gloss={params.gloss ?? ''}
      {...(params.practise === '1' ? { practise: { tripId: params.tripId ?? null } } : {})}
    />
  );
}

/** A phrase card's SHOW mode (3h-3): the phrase full screen, to show a driver or a counter. */
export default premiumRoute({ premium: PremiumPhraseShowScreen, legacy: CurrentPhraseShowRoute });
