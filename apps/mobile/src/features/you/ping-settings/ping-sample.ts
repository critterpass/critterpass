/**
 * The spoken sample of a day at a ping budget: one or two sentences the phone reads out as the
 * budget moves, so the number means something. No recorded guide samples ship with the app, so
 * the phone's own voice reads it (`expo-speech`, offline included); a build without the speech
 * module stays silent and the caption under the bar says the same thing.
 */
import { requireOptionalNativeModule } from 'expo';
import type * as SpeechModule from 'expo-speech';
import { t } from '@lingui/core/macro';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SampleBand = 'quiet' | 'steady' | 'chatty';

export function sampleBand(budget: number): SampleBand {
  if (budget <= 3) return 'quiet';
  return budget <= 7 ? 'steady' : 'chatty';
}

/** What a day sounds like at `budget` pings. */
export function sampleLine(budget: number): string {
  switch (sampleBand(budget)) {
    case 'quiet':
      return t({
        id: 'you.pings.sample.quiet',
        message:
          '{budget, plural, one {About # ping a day.} other {About # pings a day.}} Only the big moments: a vote closing, a plan that changed. Everything else waits for the roundup.',
        values: { budget },
      });
    case 'steady':
      return t({
        id: 'you.pings.sample.steady',
        message:
          'About {budget} pings a day. Votes, plan changes and who paid what, as they happen. The small stuff waits for the roundup.',
        values: { budget },
      });
    case 'chatty':
      return t({
        id: 'you.pings.sample.chatty',
        message:
          'About {budget} pings a day. Votes, plans, money, crew news and a critter or two, as they happen.',
        values: { budget },
      });
  }
}

function speechModule(): typeof SpeechModule | null {
  if (requireOptionalNativeModule('ExpoSpeech') === null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded native-module load
  return require('expo-speech') as typeof SpeechModule;
}

const SETTLE_MS = 350;

/** Reads the sample for a budget once the bar has settled; a newer value replaces the old one. */
export function usePingSample(locale: string): (budget: number) => void {
  const [speech] = useState(speechModule);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      void speech?.stop();
    },
    [speech],
  );

  return useCallback(
    (budget: number) => {
      if (speech === null) return;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void speech.stop();
        speech.speak(sampleLine(budget), { language: locale });
      }, SETTLE_MS);
    },
    [locale, speech],
  );
}
