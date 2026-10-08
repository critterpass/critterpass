/**
 * Help and feedback (3p-1): ← SETTINGS, the guide's line, the 2 × 2 tiles (report a problem, send
 * feedback, suggest a feature, rate the app), the help centre's search with the articles for where
 * help was opened from, and who replies. Typing in the search lists matching articles in place of
 * those rows, the matched words marked; no match offers a human. A language without articles yet
 * reads the English ones under a quiet note.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment } from 'react';
import { View } from 'react-native';

import { patterns } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { TileGrid, type Tile } from '@/ui/cards/TileGrid';
import { InfoPill } from '@/ui/chips/InfoPill';
import { SearchField } from '@/ui/inputs/SearchField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Stack } from '@/ui/layout/Stack';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { HelpSearchHit } from '../data/help-api';
import { highlight } from '../data/search-local';

export interface HubArticle {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
}

export interface HubViewProps {
  readonly guide: GuideId;
  readonly articles: readonly HubArticle[];
  /** The language has no articles yet: the English ones show under a note. */
  readonly englishFallback: boolean;
  /** The articles have been read (there may be none: offline with no copy kept). */
  readonly articlesLoaded: boolean;
  readonly query: string;
  readonly onQuery: (text: string) => void;
  readonly searching: boolean;
  readonly results: readonly HelpSearchHit[];
  /** Ideas open to votes, for "Vote on {n} ideas"; null until known. */
  readonly ideasToVote: number | null;
  /** How support answered this traveller's last ticket; null before their first. */
  readonly repliesVia: 'email' | 'inbox' | null;
  /** Whether a shake opens a problem report on this build. */
  readonly shakeToReport: boolean;
  readonly onBack: () => void;
  readonly onReport: () => void;
  readonly onFeedback: () => void;
  readonly onSuggest: () => void;
  readonly onRate: () => void;
  readonly onArticle: (slug: string) => void;
  readonly onAskHuman: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  group: { backgroundColor: t.semantic.bg.raised, borderRadius: t.radius.lg, overflow: 'hidden' },
  footer: { textAlign: 'center', paddingTop: t.space['16'] },
}));

function Marked({ text, query }: { readonly text: string; readonly query: string }) {
  const theme = useTheme();
  return (
    <Text variant="rowTitle">
      {highlight(text, query).map((run, index) =>
        run.match ? (
          <Text key={index} variant="rowTitle" color={theme.semantic.action.primary}>
            {run.text}
          </Text>
        ) : (
          <Fragment key={index}>{run.text}</Fragment>
        ),
      )}
    </Text>
  );
}

export function HubView(props: HubViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const guide = guideSticker(props.guide);
  const line = t({
    id: 'help.hub.guideLine',
    message: 'Something broke, or something’s missing? Tell me. I pass it straight to the humans.',
  });
  const typed = patterns.useTypewriter({ text: line });
  const tiles: Tile[] = [
    {
      key: 'report',
      title: t({ id: 'help.hub.report', message: 'Report a problem' }),
      ...(props.shakeToReport
        ? { caption: t({ id: 'help.hub.reportShake', message: 'Or shake any screen' }) }
        : {}),
      icon: 'flame',
      tone: 'pink',
      onPress: props.onReport,
    },
    {
      key: 'feedback',
      title: t({ id: 'help.hub.feedback', message: 'Send feedback' }),
      caption: t({ id: 'help.hub.feedbackCaption', message: 'What you love, what bugs you' }),
      icon: 'chat',
      tone: 'yellow',
      onPress: props.onFeedback,
    },
    {
      key: 'suggest',
      title: t({ id: 'help.hub.suggest', message: 'Suggest a feature' }),
      ...(props.ideasToVote === null || props.ideasToVote === 0
        ? {}
        : {
            caption: t({
              id: 'help.hub.suggestCaption',
              message: `Vote on ${props.ideasToVote} ideas`,
            }),
          }),
      icon: 'spark',
      tone: 'blue',
      onPress: props.onSuggest,
    },
    {
      key: 'rate',
      title: t({ id: 'help.hub.rate', message: 'Rate the app' }),
      caption: t({ id: 'help.hub.rateCaption', message: 'Takes ten seconds' }),
      icon: 'heart',
      tone: 'green',
      onPress: props.onRate,
    },
  ];
  const typing = props.query.trim().length > 0;
  const rows: readonly HubArticle[] = typing ? props.results : props.articles;
  return (
    <Scaffold variant="dark" edges={['top']} testID="help-hub">
      <KeyboardScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'help.hub.back', message: 'Settings' })}
          onPress={props.onBack}
          testID="help-hub-back"
        />
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'help.hub.title', message: 'Help and feedback' })}
        </Text>
        <GuideLine
          guide={props.guide}
          name={guide.name}
          line={typed.visibleText}
          bubble
          sticker={
            <Sticker
              kind={guide.kind}
              name={guide.name}
              size={52}
              variant="mask"
              maskColor={theme.semantic.bg.control}
              sticker={null}
            />
          }
          testID="help-hub-guide"
        />
        <TileGrid tiles={tiles} />
        <Stack gap="8">
          <Text variant="eyebrow" accessibilityRole="header">
            {t({ id: 'help.hub.centre', message: 'Help centre' })}
          </Text>
          <SearchField
            value={props.query}
            onChangeText={props.onQuery}
            label={t({ id: 'help.hub.search', message: 'Refunds, offline maps, splitting…' })}
            testID="help-search"
          />
          {props.englishFallback ? (
            <InfoPill icon="pin" testID="help-english-note">
              {t({ id: 'help.hub.english', message: 'Shown in English for now' })}
            </InfoPill>
          ) : null}
          {typing ? (
            <Stack gap="8">
              {rows.map((article) => (
                <Card
                  key={article.slug}
                  onPress={() => props.onArticle(article.slug)}
                  accessibilityLabel={`${article.title}, ${article.summary}`}
                  testID={`help-article-${article.slug}`}
                >
                  <Stack gap="2">
                    <Marked text={article.title} query={props.query} />
                    <SecondaryText>{article.summary}</SecondaryText>
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : !props.articlesLoaded ? (
            <Skeleton preset="lines" repeat={3} />
          ) : rows.length === 0 ? (
            <SecondaryText testID="help-articles-none">
              {t({
                id: 'help.hub.articlesOffline',
                message: 'The help centre opens once you’re back online.',
              })}
            </SecondaryText>
          ) : (
            <View style={styles.group}>
              {rows.map((article) => (
                <ListCard
                  key={article.slug}
                  title={article.title}
                  onPress={() => props.onArticle(article.slug)}
                  testID={`help-article-${article.slug}`}
                />
              ))}
            </View>
          )}
          {typing && !props.searching && rows.length === 0 ? (
            <Stack gap="8" testID="help-no-results">
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'help.hub.noResults',
                  message: 'Nothing in the help centre matches that yet.',
                })}
              </Text>
              <PillButton
                variant="secondary"
                label={t({ id: 'help.hub.askHuman', message: 'Ask a human' })}
                onPress={props.onAskHuman}
                testID="help-ask-human"
              />
            </Stack>
          ) : null}
        </Stack>
        <Text variant="caption" color={theme.semantic.text.secondary} style={styles.footer}>
          {props.repliesVia === 'email'
            ? t({
                id: 'help.hub.footerEmail',
                message: 'A human replies by email within two days.',
              })
            : props.repliesVia === 'inbox'
              ? t({
                  id: 'help.hub.footerInbox',
                  message: 'A human replies in your Inbox within two days.',
                })
              : t({ id: 'help.hub.footer', message: 'A human replies within two days.' })}
        </Text>
      </KeyboardScrollView>
      {/* Rides the keyboard up, so the list above ends at the keyboard and its last results scroll clear. */}
      <KeyboardFooter>{null}</KeyboardFooter>
    </Scaffold>
  );
}
