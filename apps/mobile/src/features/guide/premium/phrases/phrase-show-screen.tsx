/**
 * Phrase show mode (5.23), a full-screen cover: the phrase huge in white on ink with its
 * translation in quotes under it, the language in its own name on a glass pill, "Play it out loud"
 * beside its play disc in the phone's voice, the guide pointing at it, the screen at full
 * brightness and the status bar in white. Tapping anywhere goes back; ✕ stays top-left
 * (Foundations), so the language pill takes the other corner.
 */
import { t } from '@lingui/core/macro';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import {
  CritterSticker,
  GlassPill,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen, StatusBarOver, useScreenInsets } from '@/ui/premium/shell';

import { useLanguageNames } from '../../camera/menu-language';
import { usePractiseHref } from '../../phrases/practise-link';
import { usePhraseSpeech } from '../../phrases/use-phrase-speech';
import { PHRASE_PAINT } from '../guide-paint';

/** The pointing guide leans in, as drawn. */
const GUIDE_TILT = -8;

/**
 * Each language in its own words, the way the person the phrase is shown to reads it. Names, not
 * app copy: they read the same in every app language.
 */
/* eslint-disable lingui/no-unlocalized-strings -- language autonyms, the same in every language */
const AUTONYMS: Readonly<Record<string, string>> = {
  id: 'Bahasa Indonesia',
  ms: 'Bahasa Melayu',
  vi: 'Tiếng Việt',
  th: 'ภาษาไทย',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  km: 'ភាសាខ្មែរ',
  lo: 'ພາສາລາວ',
  tl: 'Filipino',
  en: 'English',
  pt: 'Português',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  de: 'Deutsch',
};
/* eslint-enable lingui/no-unlocalized-strings */

/** The language's own name, else the app's name for it, else null (no pill rather than a code). */
export function languagePillText(
  lang: string,
  names: Readonly<Record<string, string>>,
): string | null {
  const base = (lang.split('-')[0] ?? lang).toLowerCase();
  return AUTONYMS[base] ?? names[base] ?? null;
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
  const insets = useScreenInsets();
  const { width } = useWindowDimensions();
  const speech = usePhraseSpeech(phrase, lang);
  const pill = languagePillText(lang, useLanguageNames());
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
      <StatusBarOver dark />
      {pill === null ? null : (
        <View
          style={[styles.chip, { top: insets.top + th.space.gap6, right: th.space.gutter }]}
          pointerEvents="none"
        >
          <GlassPill label={pill} kind="clear" />
        </View>
      )}
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
            {t({ id: 'guide.premium.phrase.gloss', message: `“${gloss}”` })}
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
              {speech.speaking ? (
                <View style={styles.pause}>
                  <View style={[styles.pauseBar, { backgroundColor: th.color.onAccent }]} />
                  <View style={[styles.pauseBar, { backgroundColor: th.color.onAccent }]} />
                </View>
              ) : (
                <View style={[styles.triangle, { borderLeftColor: th.color.onAccent }]} />
              )}
            </View>
            <Text variant="rowText" color={th.color.onInkSurface} style={{ opacity: 0.75 }}>
              {t({ id: 'guide.premium.phrase.play', message: 'Play it out loud' })}
            </Text>
          </PressableScale>
        )}
        {practice === undefined ? null : (
          <TextButton
            align="center"
            label={t({ id: 'guide.phrase.practise', message: 'Practise saying it' })}
            onPress={() => router.replace(practice)}
            testID="guide-phrase-show-practise"
          />
        )}
        <Text
          variant="captionMuted"
          color={th.color.onInkSurface}
          style={{ opacity: 0.55, alignSelf: 'flex-start' }}
        >
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
  chip: { position: 'absolute', zIndex: 1 },
  body: { flex: 1, paddingHorizontal: 30 },
  foot: { alignItems: 'flex-start', gap: 14, paddingHorizontal: 30 },
  play: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  playDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The play glyph: a triangle a little right of centre, as a play mark sits optically.
  triangle: {
    width: 0,
    height: 0,
    marginLeft: 5,
    borderLeftWidth: 20,
    borderTopWidth: 12,
    borderBottomWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  pause: { flexDirection: 'row', gap: 6 },
  pauseBar: { width: 6, height: 22, borderRadius: 2 },
  guide: {
    position: 'absolute',
    right: 12,
    bottom: 60,
    transform: [{ rotate: `${GUIDE_TILT}deg` }],
  },
});
