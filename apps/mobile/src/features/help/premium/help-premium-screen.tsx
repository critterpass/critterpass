/**
 * Help and feedback (9.06): the title with Tokek pointing, the search pill (typing replaces the
 * rows with results; Return "Search"), the shake card, the four ways to reach us, the help centre's
 * articles and who replies. Offline, the articles wait and the ways to write still work.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import {
  CritterSticker,
  Icon,
  ListCard,
  Row,
  SearchField,
  StickerIcon,
  type StickerIconName,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useHelpHub } from '../hub/use-help-hub';

/** A row's colour tile with its sticker in paper white on it (9.06). */
function Tile({ sticker, color }: { readonly sticker: StickerIconName; readonly color: string }) {
  const th = usePremiumTheme();
  return <StickerIcon name={sticker} size={36} tile={color} color={th.accent.paper} />;
}

/** One wiggle's first and last beat, and each swing between. */
const WIGGLE_EDGE_MS = 160;
const WIGGLE_SWING_MS = 200;

/** The phone in the shake card: a short wiggle every few seconds, still under Reduce Motion. */
function ShakingPhone() {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const tilt = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    tilt.value = withRepeat(
      withDelay(
        2240,
        withSequence(
          withTiming(-10, { duration: WIGGLE_EDGE_MS }),
          withTiming(10, { duration: WIGGLE_SWING_MS }),
          withTiming(-8, { duration: WIGGLE_SWING_MS }),
          withTiming(6, { duration: WIGGLE_SWING_MS }),
          withTiming(0, { duration: WIGGLE_EDGE_MS }),
        ),
      ),
      -1,
    );
  }, [reduced, tilt]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: 16 }, { rotate: `${tilt.value}deg` }, { translateY: -16 }],
  }));
  return (
    <Animated.View
      style={[
        {
          width: 38,
          height: 64,
          borderRadius: 9,
          borderWidth: 2.5,
          borderColor: th.color.onInk,
        },
        style,
      ]}
    />
  );
}

export function HelpPremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const hub = useHelpHub();
  const typing = hub.query.trim() !== '';
  const footer =
    hub.repliesVia === 'email'
      ? t({ id: 'help.hub.footerEmail', message: 'A human replies by email within two days.' })
      : hub.repliesVia === 'inbox'
        ? t({
            id: 'help.hub.footerInbox',
            message: 'A human replies in your Inbox within two days.',
          })
        : t({ id: 'help.hub.footer', message: 'A human replies within two days.' });
  const chevron = <Icon name="forward" size={16} color={th.color.placeholder} />;
  const rows = typing ? hub.results : hub.articles;

  return (
    <PushScreen
      title={t({ id: 'help.premium.title', message: 'Help' })}
      backLabel={t({ id: 'help.hub.back', message: 'Settings' })}
      testID="help-hub"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', minHeight: 110 }}>
          <View style={{ flex: 1, gap: th.space.gap6 }}>
            <Text variant="largeTitle" accessibilityRole="header">
              {t({ id: 'help.premium.heading', message: 'How can we help?' })}
            </Text>
            <Text variant="guide" color={th.color.banner.guide.text}>
              {t({
                id: 'help.premium.guideLine',
                message: 'Ask me anything. If I can’t fix it, a human will.',
              })}
            </Text>
          </View>
          <CritterSticker kind="gecko" name="Tokek" pose="point" size={96} />
        </View>
        <SearchField
          value={hub.query}
          onChangeText={hub.onQuery}
          placeholder={t({ id: 'help.hub.search', message: 'Refunds, offline maps, splitting…' })}
          accessibilityLabel={t({ id: 'help.hub.centre', message: 'Help centre' })}
          returnKeyType="search"
          autoCorrect={false}
          testID="help-hub-search"
        />
        {typing ? null : (
          <>
            {hub.shakeToReport ? (
              <Pressable
                onPress={hub.onReport}
                accessibilityRole="button"
                style={{
                  minHeight: 96,
                  borderRadius: 24,
                  backgroundColor: th.color.inkSurface,
                  padding: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                }}
                testID="help-hub-shake"
              >
                <ShakingPhone />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="headline" color={th.color.onInkSurface}>
                    {t({ id: 'help.premium.shake', message: 'Shake any screen' })}
                  </Text>
                  <Text variant="note" color={th.color.onInkSurface} style={{ opacity: 0.7 }}>
                    {t({
                      id: 'help.premium.shakeLine',
                      message: 'It sends us that screen, with your private bits blurred.',
                    })}
                  </Text>
                </View>
              </Pressable>
            ) : null}
            <ListCard>
              <Row
                title={t({ id: 'help.hub.report', message: 'Report a problem' })}
                subtitle={
                  hub.shakeToReport
                    ? t({ id: 'help.premium.reportCaptionShake', message: 'Or shake any screen' })
                    : t({ id: 'help.premium.reportCaption', message: 'What went wrong, and where' })
                }
                leading={<Tile sticker="heart" color={th.accent.pink} />}
                trailing={chevron}
                onPress={hub.onReport}
                testID="help-hub-report"
              />
              <Row
                title={t({ id: 'help.hub.feedback', message: 'Send feedback' })}
                subtitle={t({
                  id: 'help.hub.feedbackCaption',
                  message: 'What you love, what bugs you',
                })}
                leading={<Tile sticker="chat" color={th.accent.sky} />}
                trailing={chevron}
                onPress={hub.onFeedback}
                testID="help-hub-feedback"
              />
              <Row
                title={t({ id: 'help.hub.suggest', message: 'Suggest a feature' })}
                {...(hub.ideasToVote === null
                  ? {}
                  : {
                      subtitle: t({
                        id: 'help.premium.suggestCaption',
                        message: plural(hub.ideasToVote, {
                          0: 'Be the first to suggest one',
                          one: 'Vote on # idea',
                          other: 'Vote on # ideas',
                        }),
                      }),
                    })}
                leading={<Tile sticker="spark" color={th.accent.sun} />}
                trailing={chevron}
                onPress={hub.onSuggest}
                testID="help-hub-suggest"
              />
              <Row
                title={t({ id: 'help.hub.rate', message: 'Rate the app' })}
                subtitle={t({ id: 'help.hub.rateCaption', message: 'Takes ten seconds' })}
                leading={<Tile sticker="star" color={th.accent.mint} />}
                trailing={chevron}
                onPress={hub.onRate}
                testID="help-hub-rate"
              />
            </ListCard>
          </>
        )}
        {hub.englishFallback ? (
          <Text variant="caption" tone="muted">
            {t({ id: 'help.hub.english', message: 'Shown in English for now' })}
          </Text>
        ) : null}
        {!hub.articlesLoaded && !typing ? (
          <Text variant="caption" tone="muted" testID="help-hub-offline">
            {t({
              id: 'help.hub.articlesOffline',
              message: 'The help centre opens once you’re back online.',
            })}
          </Text>
        ) : rows.length === 0 && typing && !hub.searching ? (
          <View style={{ gap: th.space.gap8, alignItems: 'flex-start' }}>
            <Text variant="body" tone="muted" testID="help-hub-no-results">
              {t({
                id: 'help.hub.noResults',
                message: 'Nothing in the help centre matches that yet.',
              })}
            </Text>
            <TextButton
              label={t({ id: 'help.hub.askHuman', message: 'Ask a human' })}
              onPress={hub.onAskHuman}
            />
          </View>
        ) : rows.length === 0 ? null : (
          <ListCard testID="help-hub-articles">
            {rows.map((article) => (
              <Row
                key={article.slug}
                title={article.title}
                subtitle={article.summary}
                trailing={chevron}
                onPress={() => hub.onArticle(article.slug)}
                testID={`help-hub-article-${article.slug}`}
              />
            ))}
          </ListCard>
        )}
        <Text variant="caption" tone="muted" align="center" style={{ marginTop: th.space.gap8 }}>
          {footer}
        </Text>
      </View>
    </PushScreen>
  );
}
