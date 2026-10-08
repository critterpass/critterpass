/**
 * What a pushed screen shows when the thing it is about is not there: it was removed, the person
 * lost access, or a link opened it before this phone synced it. A back eyebrow, the guide, a title,
 * one line and a way out, never a blank screen or an endless skeleton.
 *
 * Use it for the "loaded, and nothing found" branch of any pushed screen. The defaults say "This
 * isn't here any more" and go back (to `fallback` when opened cold); pass `title`, `line` and
 * `action` when the screen knows more (a switched-off link, a booking that was cancelled), and
 * `secondaryAction` for a second way forward. While still reading, use `ScreenLoading`.
 */
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { View } from 'react-native';

import { useActiveGuide, useGuideRowsRevision } from '@/lib/navigation/active-guide';
import { goBackOr } from '@/lib/navigation/back';

import { guideSticker } from '../avatar/guides';
import { PillButton } from '../buttons/PillButton';
import { BackEyebrow } from '../shell/BackEyebrow';
import { Sticker } from '../sticker/Sticker';
import { Scaffold } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { EmptyState } from './EmptyState';

/** The sleeping guide of an empty state, as 3b-5 draws it. */
const STICKER_SIZE = 120;

const useStyles = makeStyles((t) => ({
  header: { paddingHorizontal: t.size.gutter },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: t.space['8'] },
}));

export interface ScreenMissingAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface ScreenMissingProps {
  /** The parent section the back eyebrow names, as the loaded screen writes it ("TRIP"). */
  readonly backLabel: string;
  /** Where back and the default action land when the screen was opened cold. @default Home */
  readonly fallback?: Href | undefined;
  /** @default "This isn't here any more" */
  readonly title?: string | undefined;
  /** @default "It may have been removed, or this phone hasn't got it yet." */
  readonly line?: string | undefined;
  /** The primary way out. @default "Go back" (one screen back, or `fallback`) */
  readonly action?: ScreenMissingAction | undefined;
  /** A second way forward, drawn quieter under the primary one. */
  readonly secondaryAction?: ScreenMissingAction | undefined;
  readonly testID?: string | undefined;
}

export function ScreenMissing({
  backLabel,
  fallback,
  title,
  line,
  action,
  secondaryAction,
  testID = 'screen-missing',
}: ScreenMissingProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const { guideId } = useActiveGuide();
  // A guide row that arrives later (its name) redraws the line's speaker.
  useGuideRowsRevision();
  const critter = guideSticker(guideId);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID={testID}>
      <View style={styles.header}>
        <BackEyebrow label={backLabel} fallback={fallback} testID={`${testID}-back`} />
      </View>
      <View style={styles.body}>
        <EmptyState
          guide={guideId}
          guideName={critter.name}
          sticker={
            <Sticker
              kind={critter.kind}
              name={critter.name}
              seed={critter.seed}
              pose="sleep"
              size={STICKER_SIZE}
            />
          }
          title={title ?? t({ id: 'common.missing.title', message: 'This isn’t here any more' })}
          line={
            line ??
            t({
              id: 'common.missing.line',
              message: 'It may have been removed, or this phone hasn’t got it yet.',
            })
          }
          action={
            action ?? {
              label: t({ id: 'common.missing.back', message: 'Go back' }),
              onPress: () => goBackOr(fallback),
            }
          }
          testID={`${testID}-state`}
        />
        {secondaryAction ? (
          <PillButton
            variant="tertiary"
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            testID={`${testID}-secondary`}
          />
        ) : null}
      </View>
    </Scaffold>
  );
}
