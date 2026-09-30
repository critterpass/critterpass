/**
 * Guide lab scenes for phrase cards (3h-3), as Getting around shows them: with recorded audio,
 * without it (the phone's voice), audio still coming, audio out of reach offline (the phone's
 * voice), and SHOW mode.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Scaffold, Text, makeStyles } from '@/ui';

import { PhraseAudioContext, type PhraseAudioServices } from '../phrase-audio';
import { PhraseCard, PhraseCardView } from '../phrase-card';
import { ShowMode } from '../show-mode';
import type { PhrasePlayerState } from '../use-phrase-player';

const noop = () => undefined;
const PHRASE = 'Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.';
const GLOSS = 'Please take us to Villa Kayu Manis, Sayan road, Ubud.';
const KEY = 'phrase_audio/lab/villa.mp3';

const useStyles = makeStyles((t) => ({
  body: { padding: t.size.gutter, paddingTop: t.space['32'], gap: t.space['16'] },
}));

const onPhone: PhraseAudioServices = {
  local: () => 'file:///lab/villa.mp3',
  fetch: () => Promise.resolve(null),
  play: () => ({ stop: () => undefined }),
};

/** The address card in the given state, then two more of the trip's cards. */
function Screen({
  state,
  withAudio,
}: {
  readonly state: PhrasePlayerState;
  readonly withAudio: boolean;
}) {
  const styles = useStyles();
  return (
    <PhraseAudioContext.Provider value={onPhone}>
      <Scaffold edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text variant="eyebrow">AIRPORT → VILLA · 1H 05M</Text>
          <PhraseCardView
            phrase={PHRASE}
            lang="id"
            gloss={GLOSS}
            eyebrow="Show this to Made"
            playerState={state}
            deviceVoice={!withAudio || state === 'unavailable'}
            onPlay={noop}
          />
          <PhraseCard
            phrase="Tunggu sebentar, ya."
            lang="id"
            gloss="Please wait a moment."
            tone="raised"
            audioKey={KEY}
            testID="guide-phrase-wait"
          />
          <PhraseCard
            phrase="Berapa harganya?"
            lang="id"
            gloss="How much is it?"
            tone="raised"
            audioKey={null}
            testID="guide-phrase-price"
          />
        </ScrollView>
      </Scaffold>
    </PhraseAudioContext.Provider>
  );
}

export const PHRASE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'phrase-audio': () => <Screen state="idle" withAudio />,
  'phrase-show-only': () => <Screen state="idle" withAudio={false} />,
  'phrase-loading': () => <Screen state="loading" withAudio />,
  'phrase-unavailable': () => <Screen state="unavailable" withAudio />,
  'phrase-show-mode': () => <ShowMode phrase={PHRASE} lang="id" gloss={GLOSS} />,
};
