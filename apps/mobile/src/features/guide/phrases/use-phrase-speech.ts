/**
 * The phone's own voice for a phrase card with no recorded audio (or audio that can't be reached):
 * `expo-speech` reads the phrase in its language, offline included, and the card says it is the
 * phone's voice rather than the guide's. Tapping again while it speaks stops it. A build without
 * the speech module has no voice: `speak` is `null` and the card is shown only.
 */
import { requireOptionalNativeModule } from 'expo';
import type * as SpeechModule from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

function speechModule(): typeof SpeechModule | null {
  if (requireOptionalNativeModule('ExpoSpeech') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-speech') as typeof SpeechModule;
}

export function usePhraseSpeech(phrase: string, lang: string) {
  const [speech] = useState(speechModule);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => void speech?.stop(), [speech]);

  const toggle = useCallback(() => {
    if (speech === null) return;
    if (speaking) {
      void speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const done = () => setSpeaking(false);
    speech.speak(phrase, { language: lang, onDone: done, onStopped: done, onError: done });
  }, [lang, phrase, speaking, speech]);

  return { speaking, speak: speech === null ? null : toggle };
}
