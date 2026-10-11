/**
 * Phrase show mode (5.23): the phrase huge in white on ink with its translation under it, the
 * language on a glass chip, "Play it out loud" in the phone's voice, the guide pointing at it, the
 * screen at full brightness. Tapping anywhere goes back; ✕ stays top-left (Foundations).
 */
import { t } from '@lingui/core/macro';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBackOr } from '@/lib/navigation/back';
import {
  CritterSticker,
  GlassPill,
  Icon,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { usePractiseHref } from '../../phrases/practise-link';
import { usePhraseSpeech } from '../../phrases/use-phrase-speech';
import { PHRASE_PAINT } from '../guide-paint';

/** The pointing guide leans in, as drawn. */
const GUIDE_TILT = -8;

function languageName(lang: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

export function PremiumPhraseShowScreen() {
  const params = useLocalSearchParams<{
    phrase?: string;
    lang?: string;
    gloss?: string;
    practise?: string;
    tripId?: string;
  }>();
  const phrase = params.phrase ?? '';
  const lang = params.lang ?? 'en';
  const gloss = params.gloss ?? '';
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const speech = usePhraseSpeech(phrase, lang);
  const practice = usePractiseHref(
    params.practise === '1' ? { tripId: params.tripId ?? null } : undefined,
    lang,
    phrase,
  );
  // 58 pt on a 390 pt phone, smaller for long phrases so it still fits.
  const size = Math.round((width / 390) * (phrase.length > 40 ? 40 : 58));
  return (
    <FullScreen
      closeLabel={t({ id: 'guide.premium.phrase.close', message: 'Close' })}
      brighten
      testID="guide-phrase-show"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: th.color.inkSurface }]}>
        <View
          style={[StyleSheet.absoluteFill, { experimental_backgroundImage: PHRASE_PAINT.glow }]}
        />
      </View>
      <View style={[styles.chip, { top: insets.top + 8 }]} pointerEvents="none">
        <GlassPill label={languageName(lang, 'en')} kind="clear" />
      </View>
      <Pressable
        style={[styles.body, { paddingTop: insets.top + 140 }]}
        accessibilityRole="button"
        accessibilityLabel={gloss === '' ? phrase : `${phrase}. ${gloss}`}
        accessibilityLanguage={lang}
        accessibilityHint={t({ id: 'guide.phrase.closeHint', message: 'Double tap to close' })}
        onPress={() => goBackOr()}
      >
        <Text
          variant="hero"
          color={th.color.onInkSurface}
          accessibilityLanguage={lang}
          style={{ fontSize: size, lineHeight: Math.round(size * 1.04) }}
        >
          {phrase}
        </Text>
        {gloss === '' ? null : (
          <Text
            variant="headline"
            color={th.color.onInkSurface}
            style={{ marginTop: 20, opacity: 0.7, fontStyle: 'italic' }}
          >
            {gloss}
          </Text>
        )}
      </Pressable>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.guide} pointerEvents="none">
          <CritterSticker kind="gecko" name="Tokek" size={96} pose="point" />
        </View>
        {speech.speak === null ? null : (
          <PressableScale
            onPress={speech.speak}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'guide.premium.phrase.play', message: 'Play it out loud' })}
            style={styles.play}
            testID="guide-phrase-play"
          >
            <View style={[styles.playDisc, { backgroundColor: th.accent.sun }]}>
              <Icon
                name={speech.speaking ? 'minus' : 'forward'}
                size={26}
                color={th.color.onAccent}
              />
            </View>
            <Text variant="rowText" color={th.color.onInkSurface} style={{ opacity: 0.75 }}>
              {t({ id: 'guide.premium.phrase.play', message: 'Play it out loud' })}
            </Text>
          </PressableScale>
        )}
        {practice === undefined ? null : (
          <TextButton
            label={t({ id: 'guide.phrase.practise', message: 'Practise saying it' })}
            onPress={() => router.replace(practice)}
            testID="guide-phrase-show-practise"
          />
        )}
        <Text variant="captionMuted" color={th.color.onInkSurface} style={{ opacity: 0.55 }}>
          {t({
            id: 'guide.premium.phrase.hint',
            message: 'Brightness up · tap anywhere to close',
          })}
        </Text>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  chip: { position: 'absolute', alignSelf: 'center' },
  body: { flex: 1, paddingHorizontal: 30 },
  foot: { alignItems: 'center', gap: 14 },
  play: { alignItems: 'center', gap: 8 },
  playDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    position: 'absolute',
    right: 12,
    bottom: 60,
    transform: [{ rotate: `${GUIDE_TILT}deg` }],
  },
});
