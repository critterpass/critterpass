/**
 * The place's AI-written profile, for a place without a reviewed note: its photos (each from a
 * cited page), why go, the best time and the crowd line under an "AI summary" label, the facts
 * (a fact with one source asks to be checked before going), the pages it was written from, and
 * "Report a problem".
 * Shown in English, said so, while the reader's language is being written. Nothing while the
 * profile is being written: the rest of the page stands on its own.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Image, Linking, ScrollView, View } from 'react-native';

import { singleSource, type ReadyProfile } from '@/data/places/place-read';
import { TextLink } from '@/ui/buttons/TextLink';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { ReportProfile } from './report-profile';

const STRIP_HEIGHT = 96;
const STRIP_WIDTH = 128;

const useStyles = makeStyles((t) => ({
  strip: { gap: t.space['8'] },
  photo: {
    height: STRIP_HEIGHT,
    width: STRIP_WIDTH,
    borderRadius: t.radius.sm,
    backgroundColor: t.semantic.bg.raised,
  },
  card: {
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    paddingHorizontal: t.space['14'],
  },
  row: { paddingVertical: t.space['12'], gap: t.space['2'] },
  divider: { borderTopWidth: 1, borderTopColor: t.color.divider },
}));

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

function hostOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return match?.[1] ?? url;
}

/** The language a locale tag reads in (`vi-VN` → `vi`). */
const languageOf = (tag: string): string => tag.toLowerCase().split(/[-_]/u)[0] ?? tag;

export function PlaceProfileSection({
  placeId,
  profile,
}: {
  readonly placeId: string;
  readonly profile: ReadyProfile;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const english = languageOf(profile.locale) !== languageOf(i18n.locale);
  const lines = [profile.whyGo, profile.bestTime, profile.crowd].filter((line) => line !== '');
  return (
    <View style={{ gap: theme.space['14'] }} testID="place-detail-profile">
      {profile.photos.length === 0 ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          testID="place-detail-profile-photos"
        >
          {profile.photos.map((photo) => (
            <Image
              key={photo.url}
              source={{ uri: photo.url }}
              style={styles.photo}
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
      )}
      {lines.length === 0 ? null : (
        <View style={{ gap: theme.space['8'] }} testID="place-detail-profile-text">
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {upper(t({ id: 'explore.profile.label', message: 'AI summary' }), i18n.locale)}
          </Text>
          {lines.map((line) => (
            <Text key={line} variant="body" singleLine={false}>
              {line}
            </Text>
          ))}
          {english ? (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              singleLine={false}
              testID="place-detail-profile-english"
            >
              {t({
                id: 'explore.profile.english',
                message: 'In English while it’s written in your language.',
              })}
            </Text>
          ) : null}
        </View>
      )}
      {profile.facts.length === 0 ? null : (
        <View style={styles.card} testID="place-detail-profile-facts">
          {profile.facts.map((fact, index) => (
            <View
              key={`${fact.kind}-${fact.text}`}
              style={[styles.row, index === 0 ? null : styles.divider]}
            >
              <Text variant="rowTitle" singleLine={false}>
                {fact.text}
              </Text>
              {singleSource(fact) ? (
                <Text
                  variant="bodySm"
                  color={theme.semantic.text.secondary}
                  testID="place-detail-profile-check"
                >
                  {t({ id: 'explore.profile.check', message: 'Check before you go' })}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
      {profile.sources.length === 0 ? null : (
        <View
          style={{ gap: theme.space['4'], alignItems: 'flex-start' }}
          testID="place-detail-profile-sources"
        >
          <Text variant="label" color={theme.semantic.text.secondary}>
            {t({ id: 'explore.profile.sources', message: 'Written from' })}
          </Text>
          {profile.sources.map((source) => (
            <TextLink
              key={source.url}
              label={source.title === '' ? hostOf(source.url) : source.title}
              onPress={() => open(source.url)}
              testID="place-detail-profile-source"
            />
          ))}
        </View>
      )}
      <ReportProfile poiId={placeId} />
    </View>
  );
}
