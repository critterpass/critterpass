/**
 * No draft yet (or the last one failed before it was saved): the guide offers to draft the trip,
 * or to try again. Nothing was used up either way. Undesigned: the empty-state pattern.
 */
import { t } from '@lingui/core/macro';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';

export interface NoDraftProps {
  readonly guide: GuideId;
  readonly failed: boolean;
  readonly onDraft: () => void;
}

export function NoDraft({ guide, failed, onDraft }: NoDraftProps) {
  const info = GUIDE_STICKERS[guide];
  const guideName = info.name;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="draft-empty">
      <EmptyState
        guide={guide}
        guideName={guideName}
        sticker={
          <Sticker kind={info.kind} name={info.name} pose={failed ? 'think' : 'sleep'} size={120} />
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
    </Scaffold>
  );
}
