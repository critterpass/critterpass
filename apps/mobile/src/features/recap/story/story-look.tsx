/**
 * How the recap story looks: the player view, the card's footer action, the MVP vote, the
 * not-ready state and the cards themselves. The current look is the default; the premium one
 * passes its own components with the same props.
 */
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import type { ComponentType } from 'react';

import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { MvpSheet, type MvpSheetProps } from './mvp-sheet';
import type { StoryCardViews } from './story-card-views';
import { StoryFooter, type StoryFooterProps } from './story-footer';
import { StoryView, type StoryViewProps } from './story-view';

/** The story is not ready yet (or still loading): a way on to the recap page. */
function StoryAbsent({ loaded, summaryHref, onOpenRecap }: StoryAbsentProps) {
  const { t } = useLingui();
  const backLabel = t({ id: 'recap.story.back', message: 'Recap' });
  return loaded ? (
    <ScreenMissing
      backLabel={backLabel}
      fallback={summaryHref}
      title={t({ id: 'recap.story.notReady.title', message: 'The story isn’t ready yet' })}
      line={t({
        id: 'recap.story.notReady.line',
        message: 'The recap is still being put together. Its page shows where it is.',
      })}
      action={{
        label: t({ id: 'recap.story.notReady.action', message: 'Open the recap' }),
        onPress: onOpenRecap,
      }}
      testID="recap-story-missing"
    />
  ) : (
    <ScreenLoading
      backLabel={backLabel}
      fallback={summaryHref}
      label={t({ id: 'recap.story.loading', message: 'Loading the story' })}
      testID="recap-story-waiting"
    />
  );
}

export interface StoryAbsentProps {
  readonly loaded: boolean;
  readonly summaryHref: Href;
  readonly onOpenRecap: () => void;
}

/** How the story looks: the current views, or the premium ones (same props, same behaviour). */
export interface StoryLook {
  readonly View: ComponentType<StoryViewProps>;
  readonly Footer: ComponentType<StoryFooterProps>;
  readonly Mvp: ComponentType<MvpSheetProps>;
  readonly Absent: ComponentType<StoryAbsentProps>;
  readonly cards?: StoryCardViews;
}

export const CURRENT_LOOK: StoryLook = {
  View: StoryView,
  Footer: StoryFooter,
  Mvp: MvpSheet,
  Absent: StoryAbsent,
};
