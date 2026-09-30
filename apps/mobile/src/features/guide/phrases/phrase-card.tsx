/**
 * A phrase card (3h-3), for any screen that needs one (Help, Getting around): the local phrase,
 * its gloss and a play button: the guide's recorded audio when it exists (offline once it is on
 * the phone), else the phone's own voice, labelled as such. Tapping the card opens SHOW mode: the phrase full
 * screen in large type for the driver or the person at the counter.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import { Stack, Text, useTheme } from '@/ui';
import { PhraseCard as PhraseCardSurface } from '@/ui/trip/PhraseCard';

import { usePhrasePlayer, type PhrasePlayerState } from './use-phrase-player';
import { usePhraseSpeech } from './use-phrase-speech';

export interface PhraseCardProps {
  readonly phrase: string;
  /** BCP 47 language of the phrase. */
  readonly lang: string;
  readonly gloss: string;
  /** "Show this to Made". */
  readonly eyebrow?: string;
  /** Recorded audio, when it is ready; without it the card is shown, not played. */
  readonly audioKey?: string | null;
  readonly tone?: 'paper' | 'raised';
  readonly testID?: string;
}

export function showModeHref(phrase: string, lang: string, gloss: string): Href {
  return { pathname: '/guide/phrase', params: { phrase, lang, gloss } };
}

export interface PhraseCardViewProps extends Omit<PhraseCardProps, 'audioKey'> {
  readonly playerState: PhrasePlayerState;
  readonly onPlay: () => void;
  /** Read in the phone's own voice (no recorded audio, or none that can be reached). */
  readonly deviceVoice?: boolean;
}

export function PhraseCardView({
  phrase,
  lang,
  gloss,
  eyebrow,
  tone = 'paper',
  testID = 'guide-phrase-card',
  playerState,
  onPlay,
  deviceVoice = false,
}: PhraseCardViewProps) {
  const { t } = useLingui();
  const theme = useTheme();
  return (
    <Stack gap="6">
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t({
          id: 'guide.phrase.showHint',
          message: 'Opens the phrase full screen to show',
        })}
        onPress={() => router.push(showModeHref(phrase, lang, gloss))}
      >
        <PhraseCardSurface
          phrase={phrase}
          lang={lang}
          translation={`“${gloss}”`}
          tone={tone}
          playing={playerState === 'playing'}
          testID={testID}
          {...(eyebrow === undefined ? {} : { eyebrow })}
          onPlay={onPlay}
        />
      </Pressable>
      {playerState === 'loading' ? (
        <Text variant="caption" color={theme.semantic.text.secondary} testID="guide-phrase-loading">
          {t({ id: 'guide.phrase.loading', message: 'Getting the audio…' })}
        </Text>
      ) : deviceVoice ? (
        <Text
          variant="caption"
          color={theme.semantic.text.secondary}
          testID="guide-phrase-device-voice"
        >
          {t({ id: 'guide.phrase.deviceVoice', message: "Read in your phone's voice" })}
        </Text>
      ) : null}
    </Stack>
  );
}

export function PhraseCard({ audioKey = null, ...props }: PhraseCardProps) {
  const player = usePhrasePlayer(audioKey);
  const speech = usePhraseSpeech(props.phrase, props.lang);
  // No recorded audio, or none that can be reached: the phone reads it in its own voice.
  const spoken = audioKey === null || player.state === 'unavailable';
  return (
    <PhraseCardView
      {...props}
      playerState={spoken ? (speech.speaking ? 'playing' : 'idle') : player.state}
      deviceVoice={spoken}
      onPlay={spoken ? speech.toggle : () => void player.toggle()}
    />
  );
}
