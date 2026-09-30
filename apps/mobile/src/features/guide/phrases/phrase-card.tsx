/**
 * A phrase card (3h-3), for any screen that needs one (Help, Getting around): the local phrase,
 * its gloss and, when the guide's recorded audio exists, a play button that reads it aloud
 * (offline once the audio is on the phone). Tapping the card opens SHOW mode: the phrase full
 * screen in large type for the driver or the person at the counter.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { Pressable } from 'react-native';

import { Stack, Text, useTheme } from '@/ui';
import { PhraseCard as PhraseCardSurface } from '@/ui/trip/PhraseCard';

import { usePhrasePlayer, type PhrasePlayerState } from './use-phrase-player';

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
  /** Present when the card has recorded audio to play. */
  readonly onPlay?: () => void;
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
          {...(onPlay === undefined ? {} : { onPlay })}
        />
      </Pressable>
      {playerState === 'loading' ? (
        <Text variant="caption" color={theme.semantic.text.secondary} testID="guide-phrase-loading">
          {t({ id: 'guide.phrase.loading', message: 'Getting the audio…' })}
        </Text>
      ) : playerState === 'unavailable' ? (
        <Text
          variant="caption"
          color={theme.semantic.text.secondary}
          testID="guide-phrase-unavailable"
        >
          {t({
            id: 'guide.phrase.unavailable',
            message: "The audio isn't on this phone yet. Tap the card to show it instead.",
          })}
        </Text>
      ) : null}
    </Stack>
  );
}

export function PhraseCard({ audioKey = null, ...props }: PhraseCardProps) {
  const player = usePhrasePlayer(audioKey);
  return (
    <PhraseCardView
      {...props}
      playerState={player.state}
      {...(audioKey === null ? {} : { onPlay: () => void player.toggle() })}
    />
  );
}
