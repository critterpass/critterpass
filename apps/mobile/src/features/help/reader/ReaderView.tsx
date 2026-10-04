/**
 * A help article (design in code): a paper page with ← HELP, the title and its summary, the body
 * drawn from its Markdown (headings, paragraphs, lists, bold, and help links that open the linked
 * article), "Was this helpful?" (yes or no, counted only), and "Still stuck? Ask a human", which
 * opens send feedback with the article noted. An English article in another language says so.
 */
import { useLingui } from '@lingui/react/macro';
import { Fragment } from 'react';
import { ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { helpLinkSlug, parseMarkdown, type Inline } from '../data/markdown';

export interface ReaderArticle {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly body_md: string;
  /** Shown in English because the app's language has no copy of it yet. */
  readonly inEnglish: boolean;
}

export interface ReaderViewProps {
  /** null while it loads, `missing` when the article is not on the phone. */
  readonly article: ReaderArticle | null | 'missing';
  readonly helpful: boolean | null;
  readonly onHelpful: (helpful: boolean) => void;
  readonly onOpenArticle: (slug: string) => void;
  readonly onAskHuman: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  item: { flexDirection: 'row', gap: t.space['8'] },
  marker: { minWidth: t.space['16'] },
  itemText: { flex: 1 },
  divider: { height: 1, backgroundColor: t.color.divider },
}));

function Inlines({
  inlines,
  onOpenArticle,
}: {
  readonly inlines: readonly Inline[];
  readonly onOpenArticle: (slug: string) => void;
}) {
  return (
    <Text variant="body">
      {inlines.map((inline, index) => {
        if (inline.kind === 'bold') {
          return (
            <Text key={index} variant="body" style={{ fontWeight: '700' }}>
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
              style={{ textDecorationLine: 'underline', fontWeight: '700' }}
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

export function ReaderView(props: ReaderViewProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { article } = props;
  return (
    <Scaffold variant="paper" edges={['top']} testID="help-article">
      <ScrollView contentContainerStyle={styles.content}>
        <BackEyebrow
          label={t({ id: 'help.article.back', message: 'Help' })}
          onPress={props.onBack}
          testID="help-article-back"
        />
        {article === null ? null : article === 'missing' ? (
          <EmptyState
            guide="tokek"
            guideName={guideSticker('tokek').name}
            title={t({ id: 'help.article.missingTitle', message: 'This article isn’t here yet' })}
            line={t({
              id: 'help.article.missingBody',
              message: 'It arrives with the help centre next time you’re online.',
            })}
            testID="help-article-missing"
          />
        ) : (
          <>
            <Text variant="h1" accessibilityRole="header" testID="help-article-title">
              {article.title}
            </Text>
            {article.inEnglish ? (
              <InfoPill icon="pin" testID="help-article-english">
                {t({ id: 'help.article.english', message: 'Shown in English for now' })}
              </InfoPill>
            ) : null}
            <Text variant="bodyLg" color={theme.color.paper.muted}>
              {article.summary}
            </Text>
            {parseMarkdown(article.body_md).map((block, index) => {
              if (block.kind === 'heading') {
                return (
                  <Text key={index} variant="h3" accessibilityRole="header">
                    {block.text}
                  </Text>
                );
              }
              if (block.kind === 'paragraph') {
                return (
                  <Inlines
                    key={index}
                    inlines={block.inlines}
                    onOpenArticle={props.onOpenArticle}
                  />
                );
              }
              return (
                <Stack key={index} gap="6">
                  {block.items.map((item, itemIndex) => (
                    <View key={itemIndex} style={styles.item}>
                      <Text variant="body" style={styles.marker}>
                        {block.ordered ? `${String(itemIndex + 1)}.` : '•'}
                      </Text>
                      <View style={styles.itemText}>
                        <Inlines inlines={item} onOpenArticle={props.onOpenArticle} />
                      </View>
                    </View>
                  ))}
                </Stack>
              );
            })}
            <View style={styles.divider} />
            <Stack gap="8">
              <Text variant="eyebrow">
                {t({ id: 'help.article.helpful', message: 'Was this helpful?' })}
              </Text>
              <Row gap="8">
                <ChoiceChip
                  label={t({ id: 'help.article.yes', message: 'Yes' }).toUpperCase()}
                  selected={props.helpful === true}
                  onPress={() => props.onHelpful(true)}
                  testID="help-article-helpful-yes"
                />
                <ChoiceChip
                  label={t({ id: 'help.article.no', message: 'No' }).toUpperCase()}
                  selected={props.helpful === false}
                  onPress={() => props.onHelpful(false)}
                  testID="help-article-helpful-no"
                />
              </Row>
              {props.helpful === null ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {t({
                    id: 'help.article.thanks',
                    message: 'Thanks. That helps us fix the words.',
                  })}
                </Text>
              )}
            </Stack>
            <Stack gap="8">
              <Text variant="title">
                {t({ id: 'help.article.stuck', message: 'Still stuck?' })}
              </Text>
              <PillButton
                label={t({ id: 'help.article.askHuman', message: 'Ask a human' }).toUpperCase()}
                onPress={props.onAskHuman}
                testID="help-article-ask"
              />
            </Stack>
          </>
        )}
      </ScrollView>
    </Scaffold>
  );
}
