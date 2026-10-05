/**
 * What the places list says when a filter has nothing behind it: SAVED with nothing saved tells
 * how to save (swipe a row right, or the heart on a place's page), IN THE PLAN before any stop
 * says so, and both lead back to every place.
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
  readonly onShowAll: () => void;
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
        action={{
          label: t({ id: 'places.empty.showAll', message: 'Show all places' }),
          onPress: onShowAll,
        }}
        testID="places-empty"
      />
    </View>
  );
}
