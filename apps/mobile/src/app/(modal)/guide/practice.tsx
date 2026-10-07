import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import {
  PracticeScreen,
  type PracticeScreenProps,
} from '@/features/guide/practice/practice-screen';

import { getSpeech, startListening } from '../../../../modules/cp-speech';

/** The native speech module as practice uses it; null in a build without the module. */
function deviceSpeech(): PracticeScreenProps['speech'] {
  const speech = getSpeech();
  if (speech === null) return null;
  return {
    listen: (locale, getToken, onPartial) =>
      startListening(speech, { locale, getToken, onPartial }),
    endSession: () => void speech.endSession().catch(() => undefined),
  };
}

/**
 * Phrase practice: say the trip's phrases out loud, with the guide checking how they sound when
 * that is switched on. `lang` picks the language and `text` the phrase to start on (the card the
 * person came from).
 */
export default function PracticeRoute() {
  const params = useLocalSearchParams<{ tripId?: string; lang?: string; text?: string }>();
  const speech = useMemo(() => deviceSpeech(), []);
  const given = (value: string | undefined) =>
    typeof value === 'string' && value !== '' ? value : null;
  return (
    <PracticeScreen
      tripId={given(params.tripId)}
      language={given(params.lang)}
      startText={given(params.text)}
      speech={speech}
    />
  );
}
