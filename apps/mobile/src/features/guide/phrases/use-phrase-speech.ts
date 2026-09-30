/**
 * The phone's own voice for a phrase card with no recorded audio (or audio that can't be reached):
 * `expo-speech` reads the phrase in its language, offline included, and the card says it is the
 * phone's voice rather than the guide's. Tapping again while it speaks stops it.
 */
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

export function usePhraseSpeech(phrase: string, lang: string) {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => void Speech.stop(), []);

  const toggle = useCallback(() => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const done = () => setSpeaking(false);
    Speech.speak(phrase, { language: lang, onDone: done, onStopped: done, onError: done });
  }, [lang, phrase, speaking]);

  return { speaking, toggle };
}
