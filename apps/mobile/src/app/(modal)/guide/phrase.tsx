import { useLocalSearchParams } from 'expo-router';

import { ShowMode } from '@/features/guide/phrases/show-mode';

/** A phrase card's SHOW mode (3h-3): the phrase full screen, to show a driver or a counter. */
export default function PhraseShowRoute() {
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
