/**
 * No draft yet (or the last one failed before it was saved): the guide offers to draft the trip,
 * or to try again, under the review's own back eyebrow. Nothing was used up either way.
 * Undesigned: the empty-state pattern.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: th.space['32'] + th.space['12'],
  },
  centre: { flex: 1, justifyContent: 'center' },
}));

export interface NoDraftProps {
  readonly guide: GuideId;
  readonly failed: boolean;
  /** What the back eyebrow names (where back goes). */
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly onDraft: () => void;
}

export function NoDraft({ guide, failed, backLabel, onBack, onDraft }: NoDraftProps) {
  const styles = useStyles();
  const info = guideSticker(guide);
  const guideName = info.name;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="draft-empty">
      <View style={styles.header}>
        <BackEyebrow label={backLabel} onPress={onBack} testID="draft-back" />
      </View>
      <View style={styles.centre}>
        <EmptyState
          guide={guide}
          guideName={guideName}
          sticker={
            <Sticker
              kind={info.kind}
              name={info.name}
              pose={failed ? 'think' : 'sleep'}
              size={120}
            />
          }
          title={
            failed
              ? t({ id: 'planDraft.empty.failedTitle', message: 'The draft didn’t finish' })
              : t({ id: 'planDraft.empty.title', message: 'No draft yet' })
          }
          line={
            failed
              ? t({
                  id: 'planDraft.empty.failedLine',
                  message: 'Nobody saw it and nothing was used up. Want me to try again?',
                })
              : t({
                  id: 'planDraft.empty.line',
                  message: `Finish setup and ${guideName} drafts the whole trip for you.`,
                })
          }
          action={{
            label: failed
              ? t({ id: 'planDraft.empty.retry', message: 'Try again' })
              : t({ id: 'planDraft.empty.draft', message: 'Draft my trip' }),
            onPress: onDraft,
          }}
        />
      </View>
    </Scaffold>
  );
}
