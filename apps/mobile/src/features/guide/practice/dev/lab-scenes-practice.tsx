/**
 * Guide lab scenes for phrase practice: ready with the check off ("I said it"), the check on and
 * listening, a miss with the guide's tip, a practice that went well, the voice consent asked under
 * the switch, the microphone refused, offline, and a trip with no phrases yet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { PhraseCardView } from '../../phrases/phrase-card';
import {
  practiceLists,
  PRACTICE_READY,
  type PracticePhrase,
  type PracticeState,
} from '../practice-model';
import { PracticeView } from '../practice-view';

const noop = () => undefined;

const phrase = (id: string, text: string, gloss: string): PracticePhrase => ({
  id,
  text,
  romanisation: null,
  gloss,
  language: 'vi',
  audioKey: null,
});

export const PRACTICE_PHRASES: readonly PracticePhrase[] = [
  phrase('thanks', 'Cảm ơn nhiều', 'Thank you very much'),
  phrase('bill', 'Tính tiền giúp em', 'The bill, please'),
  phrase('peanuts', 'Tôi bị dị ứng đậu phộng', 'I am allergic to peanuts'),
  phrase('where', 'Nhà vệ sinh ở đâu?', 'Where is the toilet?'),
  phrase('hello', 'Xin chào', 'Hello'),
];

function Scene({
  state = {},
  checking = false,
  consent = false,
  learned = ['hello'],
  current = 'thanks',
  phrases = PRACTICE_PHRASES,
}: {
  readonly state?: Partial<PracticeState>;
  readonly checking?: boolean;
  readonly consent?: boolean;
  readonly learned?: readonly string[];
  readonly current?: string;
  readonly phrases?: readonly PracticePhrase[];
}) {
  const shown = phrases.find((entry) => entry.id === current) ?? null;
  return (
    <PracticeView
      guideName="Ngựa"
      lists={practiceLists(phrases, new Set(learned))}
      current={shown}
      card={
        shown === null ? null : (
          <PhraseCardView
            phrase={shown.text}
            lang={shown.language}
            gloss={shown.gloss}
            playerState="idle"
            deviceVoice
            onPlay={noop}
            testID="guide-practice-card"
          />
        )
      }
      state={{ ...PRACTICE_READY, ...state }}
      checking={checking}
      consent={consent ? { onAgree: noop, onNotNow: noop } : null}
      onChecking={noop}
      onPick={noop}
      onListen={noop}
      onCheck={noop}
      onSaid={noop}
      onNext={noop}
      onOpenSettings={noop}
    />
  );
}

export const PRACTICE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'practice-ready': () => <Scene />,
  'practice-listening': () => <Scene checking state={{ phase: 'listening', heard: 'Cảm ơn' }} />,
  'practice-tip': () => (
    <Scene
      checking
      state={{
        phase: 'retry',
        heard: 'Cam on nhiu',
        tip: 'Let "nhiều" fall and rise: start mid, dip, then lift at the end.',
      }}
    />
  ),
  'practice-ok': () => (
    <Scene checking learned={['hello', 'thanks']} state={{ phase: 'ok', heard: 'Cảm ơn nhiều' }} />
  ),
  'practice-consent': () => <Scene checking consent />,
  'practice-mic-denied': () => <Scene checking state={{ issue: 'mic_denied' }} />,
  'practice-offline': () => <Scene checking state={{ issue: 'offline' }} />,
  'practice-empty': () => <Scene phrases={[]} learned={[]} />,
};
