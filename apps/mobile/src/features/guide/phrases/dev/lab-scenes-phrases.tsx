/**
 * Guide lab scenes for phrase cards (3h-3): with recorded audio (on the phone, playing), without
 * it (shown only), audio still coming, audio out of reach offline, and SHOW mode.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { Scaffold, Stack, makeStyles } from '@/ui';

import { PhraseAudioContext, type PhraseAudioServices } from '../phrase-audio';
import { PhraseCard } from '../phrase-card';
import { ShowMode } from '../show-mode';
import { usePhrasePlayer } from '../use-phrase-player';

const PHRASE = 'Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.';
const GLOSS = 'Please take us to Villa Kayu Manis, Sayan road, Ubud.';
const KEY = 'phrase_audio/lab/villa.mp3';

const useStyles = makeStyles((t) => ({
  body: { padding: t.size.gutter, paddingTop: t.space['32'] },
}));

function services(options: { stored: boolean; fetch: 'never' | 'hang' }): PhraseAudioServices {
  return {
    local: () => (options.stored ? 'file:///lab/villa.mp3' : null),
    fetch: () => (options.fetch === 'hang' ? new Promise(() => undefined) : Promise.resolve(null)),
    play: () => ({ stop: () => undefined }),
  };
}

/** Presses play once on mount, so the scene shows the state after the tap. */
function Pressed({ audioKey }: { readonly audioKey: string }) {
  const player = usePhrasePlayer(audioKey);
  useEffect(() => {
    void player.toggle();
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Screen({
  audio,
  audioKey,
  press = false,
}: {
  readonly audio: PhraseAudioServices;
  readonly audioKey: string | null;
  readonly press?: boolean;
}) {
  const styles = useStyles();
  return (
    <PhraseAudioContext.Provider value={audio}>
      <Scaffold edges={['top', 'bottom']}>
        <Stack style={styles.body} gap="12">
          <PhraseCard
            phrase={PHRASE}
            lang="id"
            gloss={GLOSS}
            eyebrow="Show this to Made"
            audioKey={audioKey}
          />
          {press && audioKey !== null ? <Pressed audioKey={audioKey} /> : null}
        </Stack>
      </Scaffold>
    </PhraseAudioContext.Provider>
  );
}

export const PHRASE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'phrase-audio': () => (
    <Screen audio={services({ stored: true, fetch: 'never' })} audioKey={KEY} />
  ),
  'phrase-show-only': () => (
    <Screen audio={services({ stored: false, fetch: 'never' })} audioKey={null} />
  ),
  'phrase-loading': () => (
    <Screen audio={services({ stored: false, fetch: 'hang' })} audioKey={KEY} press />
  ),
  'phrase-unavailable': () => (
    <Screen audio={services({ stored: false, fetch: 'never' })} audioKey={KEY} press />
  ),
  'phrase-show-mode': () => <ShowMode phrase={PHRASE} lang="id" gloss={GLOSS} />,
};
