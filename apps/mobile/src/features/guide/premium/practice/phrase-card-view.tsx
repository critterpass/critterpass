/**
 * A phrase card in the premium look (undesigned as a card; built from the phrase show mode's
 * parts): the phrase large, its gloss in quotes, the sun play disc (the guide's recording, else the
 * phone's own voice, said under the card), and tapping the card opens show mode. A practice link
 * shows when the card offers it.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, PressableScale, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { showModeHref, type PhraseCardViewProps } from '../../phrases/phrase-card';

const DISC = 48;

export function PremiumPhraseCardView({
  phrase,
  lang,
  gloss,
  eyebrow,
  testID = 'guide-phrase-card',
  playerState,
  onPlay,
  deviceVoice = false,
  practise,
  onPractise,
}: PhraseCardViewProps) {
  const th = usePremiumTheme();
  const caption =
    playerState === 'loading'
      ? t({ id: 'guide.phrase.loading', message: 'Getting the audio…' })
      : deviceVoice
        ? t({ id: 'guide.phrase.deviceVoice', message: 'Read in your phone’s voice' })
        : playerState === 'unavailable'
          ? t({
              id: 'guide.phrase.unavailable',
              message: 'The audio isn’t on this phone yet. Tap the card to show it instead.',
            })
          : null;
  return (
    <View style={{ gap: 8 }}>
      <PressableScale
        onPress={() => router.push(showModeHref(phrase, lang, gloss, practise))}
        accessibilityRole="button"
        accessibilityLabel={`${phrase}. ${gloss}`}
        accessibilityLanguage={lang}
        accessibilityHint={t({
          id: 'guide.phrase.showHint',
          message: 'Opens the phrase full screen to show',
        })}
        testID={testID}
      >
        <Card radius={th.radius.cardLarge} style={styles.card}>
          <View style={styles.words}>
            {eyebrow === undefined ? null : (
              <Text variant="tier" tone="muted">
                {eyebrow}
              </Text>
            )}
            <Text variant="title" singleLine={false} accessibilityLanguage={lang}>
              {phrase}
            </Text>
            {gloss === '' ? null : (
              <Text variant="rowText" tone="muted" singleLine={false}>
                {`“${gloss}”`}
              </Text>
            )}
          </View>
          {onPlay === undefined ? null : (
            <PressableScale
              onPress={onPlay}
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'guide.premium.phrase.play',
                message: 'Play it out loud',
              })}
              accessibilityState={{ busy: playerState === 'playing' }}
              style={[styles.disc, { backgroundColor: th.accent.sun }]}
              testID={`${testID}-play`}
            >
              <Icon
                name={playerState === 'playing' ? 'minus' : 'forward'}
                size={22}
                color={th.color.onAccent}
              />
            </PressableScale>
          )}
        </Card>
      </PressableScale>
      {caption === null ? null : (
        <Text variant="captionMuted" singleLine={false} testID={`${testID}-caption`}>
          {caption}
        </Text>
      )}
      {onPractise === undefined ? null : (
        <TextButton
          label={t({ id: 'guide.phrase.practise', message: 'Practise saying it' })}
          onPress={onPractise}
          testID={`${testID}-practise`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  words: { flex: 1, gap: 6 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
