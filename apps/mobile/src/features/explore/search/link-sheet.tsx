/**
 * Add from a link (7d-3): the post's cover, title and author, the guide's truthful line on what it
 * read, the places as they tick in, the guide's tip for the best day, SAVE {n} TO IDEAS and "Or put
 * them on Sat 17". A screenshot is always a way in. Props only, so the lab shows each state.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { Image, StyleSheet, View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { Sheet } from '@/ui/sheet/Sheet';
import { Skeleton } from '@/ui/states/Skeleton';

import { fromWhere, guideReadLine, stopLine } from './link-copy';
import type { LinkImportState } from './link-import-model';
import { GuideSticker } from './guide-sticker';
import { MatchRow } from './match-row';

const PLAY = '▶';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'], gap: th.space['16'] },
  post: { flexDirection: 'row', gap: th.space['14'] },
  cover: {
    width: 96,
    height: 150,
    borderRadius: th.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.semantic.bg.sunken,
  },
  postText: { flex: 1, minWidth: 0, gap: th.space['6'] },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  actions: { gap: th.space['10'], alignItems: 'center' },
}));

export interface LinkSheetProps {
  readonly state: LinkImportState;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly kindWord: (category: string) => string;
  /** "Your free Sat works for these.", when a shared day fits. */
  readonly tip: string | null;
  /** "Sat 17", when the chosen places share a best day. */
  readonly dayLabel: string | null;
  readonly chosen: number;
  readonly saving: boolean;
  readonly onToggle: (label: string) => void;
  readonly onPick: (label: string) => void;
  readonly onSearch: (label: string) => void;
  readonly onSave: () => void;
  readonly onPutOnDay: () => void;
  readonly onScreenshot: () => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export function LinkSheet(props: LinkSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { state } = props;
  const source = state.source;
  const stop = stopLine(state.error);
  const title = fromWhere(source?.platform ?? null);
  const chosen = props.chosen;
  const guideName = props.guideName;
  const day = props.dayLabel ?? '';
  return (
    <Sheet
      header={<Text variant="eyebrow">{title}</Text>}
      onDismiss={props.onClose}
      accessibilityLabel={title}
      testID="search-link-sheet"
    >
      <View style={styles.body}>
        <View style={styles.post}>
          <View style={styles.cover}>
            {source?.thumb_url === null || source?.thumb_url === undefined ? null : (
              <Image
                source={{ uri: source.thumb_url }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            )}
            {source?.platform === 'tiktok' || source?.platform === 'youtube' ? (
              <Text variant="h3" color={tokens.color.paper.base}>
                {PLAY}
              </Text>
            ) : null}
          </View>
          <View style={styles.postText}>
            {source?.title === null || source?.title === undefined ? null : (
              <Text variant="h3" numberOfLines={3} testID="search-link-title">
                {source.title}
              </Text>
            )}
            {source?.author === null || source?.author === undefined ? null : (
              <Text variant="monoData" color={theme.semantic.text.secondary}>
                {source.author}
              </Text>
            )}
            <GuideLine guide={props.guide} name={props.guideName} line={guideReadLine(state)} />
          </View>
        </View>
        {state.matches.length === 0 && state.status === 'reading' ? (
          <Skeleton preset="list" repeat={2} />
        ) : null}
        {state.matches.length === 0 ? null : (
          <View style={{ gap: theme.space['8'] }}>
            <Text variant="eyebrow">
              {t({ id: 'search.link.found', message: `${guideName} found` })}
            </Text>
            <View style={styles.card}>
              {state.matches.map((match, index) => (
                <MatchRow
                  key={match.label}
                  index={index}
                  match={match}
                  selected={state.selected.has(match.label)}
                  kindWord={props.kindWord}
                  onToggle={() => props.onToggle(match.label)}
                  onPick={() => props.onPick(match.label)}
                  onSearch={() => props.onSearch(match.label)}
                />
              ))}
            </View>
          </View>
        )}
        {stop === null ? null : (
          <View style={{ gap: theme.space['8'] }} testID="search-link-stopped">
            <Text variant="body">{stop.text}</Text>
            {stop.retry ? (
              <TextLink
                label={t({ id: 'search.link.retry', message: 'Try again' })}
                onPress={props.onRetry}
              />
            ) : null}
          </View>
        )}
        {props.tip === null ? null : (
          <GuideLine
            guide={props.guide}
            name={props.guideName}
            line={props.tip}
            sticker={<GuideSticker guide={props.guide} />}
          />
        )}
        <View style={styles.actions}>
          {chosen === 0 ? null : (
            <PillButton
              label={t({ id: 'search.link.saveToIdeas', message: `Save ${chosen} to Ideas` })}
              onPress={props.onSave}
              loading={props.saving}
              block
              testID="search-link-save-ideas"
            />
          )}
          {chosen === 0 || props.dayLabel === null ? null : (
            <TextLink
              label={t({ id: 'search.link.putOnDay', message: `Or put them on ${day}` })}
              onPress={props.onPutOnDay}
              testID="search-link-put-on-day"
            />
          )}
          <TextLink
            label={t({ id: 'search.link.screenshot', message: 'Add a screenshot instead' })}
            onPress={props.onScreenshot}
            testID="search-link-screenshot"
          />
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({
              id: 'search.link.worksWith',
              message: 'Works with Instagram, Maps, YouTube and screenshots',
            })}
          </Text>
        </View>
      </View>
    </Sheet>
  );
}
