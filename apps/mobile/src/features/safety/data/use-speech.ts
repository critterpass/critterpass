/**
 * The phone's own voice for a phrase (`expo-speech`, offline included): tapping again while it
 * speaks stops it. A build without the speech module has no voice: `speak` is `null`.
 */
import { requireOptionalNativeModule } from 'expo';
import type * as SpeechModule from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

function speechModule(): typeof SpeechModule | null {
  if (requireOptionalNativeModule('ExpoSpeech') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-speech') as typeof SpeechModule;
}

export function useSpeech(text: string | null, lang: string | null) {
  const [speech] = useState(speechModule);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => void speech?.stop(), [speech]);
  const toggle = useCallback(() => {
    if (speech === null || text === null) return;
    if (speaking) {
      void speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const done = () => setSpeaking(false);
    speech.speak(text, {
      ...(lang === null ? {} : { language: lang }),
      onDone: done,
      onStopped: done,
      onError: done,
    });
  }, [lang, text, speaking, speech]);
  return { speaking, speak: speech === null || text === null ? null : toggle };
}
