/**
 * A help article in the premium look: pushed from Help with the glass back, the title and its
 * summary, the body drawn from its Markdown (headings, paragraphs, lists, bold, and help links that
 * open the linked article), "Was this helpful?" (counted only) and "Still stuck? Ask a human".
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment, useMemo } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Button,
  Card,
  EmptyState,
  enterTransition,
  LoadingCritter,
  Skeleton,
  StatusTag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { helpLinkSlug, parseMarkdown, type Inline } from '../data/markdown';
import { useHelpReader } from '../reader/reader-screen';

function Inlines({
  inlines,
  onOpenArticle,
}: {
  readonly inlines: readonly Inline[];
  readonly onOpenArticle: (slug: string) => void;
}) {
  const th = usePremiumTheme();
  return (
    <Text variant="body" tone="inkSecondary">
      {inlines.map((inline, index) => {
        if (inline.kind === 'bold') {
          return (
            <Text key={index} variant="body" tone="ink" style={{ fontWeight: '700' }}>
              {inline.text}
            </Text>
          );
        }
        if (inline.kind === 'link') {
          const slug = helpLinkSlug(inline.href);
          if (slug === null) return <Fragment key={index}>{inline.text}</Fragment>;
          return (
            <Text
              key={index}
              variant="body"
              color={th.color.caret}
              style={{ fontWeight: '600' }}
              accessibilityRole="link"
              onPress={() => onOpenArticle(slug)}
            >
              {inline.text}
            </Text>
          );
        }
        return <Fragment key={index}>{inline.text}</Fragment>;
      })}
    </Text>
  );
}

export function ArticlePremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const reader = useHelpReader();
  const { article } = reader;
  const body = article === null || article === 'missing' ? null : article.body_md;
  const blocks = useMemo(() => (body === null ? [] : parseMarkdown(body)), [body]);

  return (
    <PushScreen
      title={t({ id: 'help.hub.centre', message: 'Help centre' })}
      backLabel={t({ id: 'help.article.back', message: 'Help' })}
      testID="help-article"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap14 }}>
        {article === null ? (
          <View style={{ gap: th.space.gap12 }}>
            <Skeleton height={34} width="80%" tone="block" />
            <Skeleton height={16} />
            <Skeleton height={16} width="70%" />
            <Skeleton height={120} tone="soft" />
            <LoadingCritter
              label={t({ id: 'help.premium.articleLoading', message: 'Finding the page…' })}
              critter={{ kind: 'gecko', name: 'Tokek' }}
            />
          </View>
        ) : article === 'missing' ? (
          <View style={{ paddingTop: th.space.gap16 }}>
            <EmptyState
              critter={{ kind: 'gecko', name: 'Tokek' }}
              check={false}
              title={t({ id: 'help.article.missingTitle', message: 'This article isn’t here yet' })}
              line={t({
                id: 'help.article.missingBody',
                message: 'It arrives with the help centre next time you’re online.',
              })}
              action={
                <Button
                  label={t({ id: 'help.article.askHuman', message: 'Ask a human' })}
                  variant="secondary"
                  size="medium"
                  onPress={reader.onAskHuman}
                />
              }
              testID="help-article-missing"
            />
          </View>
        ) : (
          <Animated.View entering={enterTransition(reduced)} style={{ gap: th.space.gap14 }}>
            <Text variant="largeTitle" accessibilityRole="header" testID="help-article-title">
              {article.title}
            </Text>
            {article.inEnglish ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <StatusTag
                  tone="unopened"
                  label={t({ id: 'help.article.english', message: 'Shown in English for now' })}
                  testID="help-article-english"
                />
              </View>
            ) : null}
            <Text variant="headline" tone="muted">
              {article.summary}
            </Text>
            {blocks.map((block, index) => {
              if (block.kind === 'heading') {
                return (
                  <Text
                    key={index}
                    variant="title"
                    accessibilityRole="header"
                    style={{ marginTop: th.space.gap8 }}
                  >
                    {block.text}
                  </Text>
                );
              }
              if (block.kind === 'paragraph') {
                return (
                  <Inlines
                    key={index}
                    inlines={block.inlines}
                    onOpenArticle={reader.onOpenArticle}
                  />
                );
              }
              return (
                <View key={index} style={{ gap: th.space.gap6 }}>
                  {block.items.map((item, itemIndex) => (
                    <View key={itemIndex} style={{ flexDirection: 'row', gap: th.space.gap8 }}>
                      <Text variant="body" tone="muted" style={{ minWidth: th.space.gap16 }}>
                        {block.ordered ? `${String(itemIndex + 1)}.` : '•'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Inlines inlines={item} onOpenArticle={reader.onOpenArticle} />
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
            <Card padded style={{ marginTop: th.space.gap8, gap: th.space.gap10 }}>
              <Text variant="headline">
                {t({ id: 'help.article.helpful', message: 'Was this helpful?' })}
              </Text>
              <View style={{ flexDirection: 'row', gap: th.space.gap8 }}>
                <Button
                  label={t({ id: 'help.article.yes', message: 'Yes' })}
                  size="medium"
                  variant={reader.helpful === true ? 'primary' : 'control'}
                  onPress={() => reader.onHelpful(true)}
                  testID="help-article-helpful-yes"
                />
                <Button
                  label={t({ id: 'help.article.no', message: 'No' })}
                  size="medium"
                  variant={reader.helpful === false ? 'primary' : 'control'}
                  onPress={() => reader.onHelpful(false)}
                  testID="help-article-helpful-no"
                />
              </View>
              {reader.helpful === null ? null : (
                <Animated.View entering={enterTransition(reduced)}>
                  <Text variant="caption" tone="muted">
                    {t({
                      id: 'help.article.thanks',
                      message: 'Thanks. That helps us fix the words.',
                    })}
                  </Text>
                </Animated.View>
              )}
            </Card>
            <View style={{ gap: th.space.gap10, marginTop: th.space.gap8 }}>
              <Text variant="headline">
                {t({ id: 'help.article.stuck', message: 'Still stuck?' })}
              </Text>
              <Button
                label={t({ id: 'help.article.askHuman', message: 'Ask a human' })}
                variant="secondary"
                onPress={reader.onAskHuman}
                testID="help-article-ask"
              />
            </View>
          </Animated.View>
        )}
      </View>
    </PushScreen>
  );
}
