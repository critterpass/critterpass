/**
 * What the places list says when a filter has nothing behind it: SAVED with nothing saved tells
 * how to save (swipe a row right, or the heart on a place's page), IN THE PLAN before any stop
 * says so, and both lead back to every place. A read that failed with no places gets its own
 * words and a retry.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { EmptyState } from '@/ui/states/EmptyState';
import { makeStyles } from '@/ui/theme';

import type { GuideFacts } from '../format';

export type EmptyKind = 'saved' | 'plan' | 'none';

export interface PlacesEmptyProps {
  readonly kind: EmptyKind;
  readonly guide: GuideFacts;
  /** Absent when every place is already asked for (no filter, nothing typed). */
  readonly onShowAll?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  wrap: { paddingHorizontal: t.size.gutter, paddingTop: t.space['24'] },
}));

/** The words for an empty filter, shared with the map's peek. */
export function useEmptyWords(kind: EmptyKind): { readonly title: string; readonly line: string } {
  const { t } = useLingui();
  if (kind === 'saved') {
    return {
      title: t({ id: 'places.empty.savedTitle', message: 'Nothing saved yet' }),
      line: t({
        id: 'places.empty.savedLine',
        message: 'Swipe a place right in the list, or tap the heart on its page. It waits here.',
      }),
    };
  }
  if (kind === 'plan') {
    return {
      title: t({ id: 'places.empty.planTitle', message: 'Nothing in the plan yet' }),
      line: t({
        id: 'places.empty.planLine',
        message: 'Tap + on a place to put it on a day. Your stops are listed here by day.',
      }),
    };
  }
  return {
    title: t({ id: 'places.empty.noneTitle', message: 'No places here' }),
    line: t({ id: 'places.empty.noneLine', message: 'Nothing matches this filter yet.' }),
  };
}

export function PlacesEmpty({ kind, guide, onShowAll }: PlacesEmptyProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const words = useEmptyWords(kind);
  return (
    <View style={styles.wrap} testID={`places-empty-${kind}`}>
      <EmptyState
        guide={guide.id}
        guideName={guide.name}
        title={words.title}
        line={words.line}
        {...(onShowAll === undefined
          ? {}
          : {
              action: {
                label: t({ id: 'places.empty.showAll', message: 'Show all places' }),
                onPress: onShowAll,
              },
            })}
        testID="places-empty"
      />
    </View>
  );
}

/** The places did not load and the phone holds none: say so and offer another try. */
export function PlacesFailed({
  guide,
  onRetry,
}: {
  readonly guide: GuideFacts;
  readonly onRetry?: (() => void) | undefined;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <View style={styles.wrap} testID="places-failed">
      <EmptyState
        guide={guide.id}
        guideName={guide.name}
        title={t({ id: 'places.failed.title', message: "These places didn't load" })}
        line={t({
          id: 'places.failed.line',
          message: 'Check your connection, then try again.',
        })}
        {...(onRetry === undefined
          ? {}
          : {
              action: {
                label: t({ id: 'places.failed.retry', message: 'Try again' }),
                onPress: onRetry,
              },
            })}
        testID="places-failed-state"
      />
    </View>
  );
}

/** No signal and no downloaded region: the map cannot draw, the list still can. */
export function MapOffline({
  guide,
  onList,
}: {
  readonly guide: GuideFacts;
  readonly onList: () => void;
}) {
  const { t } = useLingui();
  return (
    <EmptyState
      guide={guide.id}
      guideName={guide.name}
      title={t({ id: 'places.mapOffline.title', message: 'No signal for the map' })}
      line={t({
        id: 'places.mapOffline.line',
        message: 'The map needs a connection or a download. Your places are in the list.',
      })}
      action={{
        label: t({ id: 'places.showList', message: 'Show as a list' }),
        onPress: onList,
      }}
      testID="places-map-offline"
    />
  );
}
