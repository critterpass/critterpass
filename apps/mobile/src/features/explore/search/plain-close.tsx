/**
 * Two states of a plain-words answer (7d-2, undesigned). "CLOSE TO THAT": nothing matched every
 * chip, so the places that match without the weakest of them show, under a line naming what was
 * left out. And a search that failed: words and a retry, never "0 places".
 */
import type { SearchChip } from '@cp/domain';
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { Text, useTheme } from '@/ui';
import { TextLink } from '@/ui/buttons/TextLink';

import { chipLabel, type ChipWords } from './chip-words';
import { PlainResults, type PlainRow } from './plain-results';

/** The chips a looser search left out, worded as the chip row words them. */
export function droppedWords(
  dropped: readonly string[],
  chips: readonly SearchChip[],
  words: ChipWords,
): string[] {
  const codes = new Set(dropped);
  return chips.filter((chip) => codes.has(chip.code)).map((chip) => chipLabel(chip, words));
}

export function closeLine(labels: readonly string[]): string {
  if (labels.length === 0) {
    return t({
      id: 'search.close.line',
      message: 'Nothing matches all of that. These come closest.',
    });
  }
  const left = labels.map((label) => `“${label}”`).join(', ');
  return t({
    id: 'search.close.lineWithout',
    message: `Nothing matches all of that. These match without ${left}.`,
  });
}

export interface ClosePlacesProps {
  readonly rows: readonly PlainRow[];
  readonly photos?: PlaceTilePhotos | undefined;
  readonly dropped: readonly string[];
  readonly chips: readonly SearchChip[];
  readonly words: ChipWords;
  readonly onOpen: (poiId: string) => void;
  readonly onAdd: (poiId: string, name: string) => void;
  readonly onMap: (() => void) | undefined;
  readonly after?: ReactNode;
}

export function ClosePlaces(props: ClosePlacesProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space['10'] }} testID="search-close-results">
      <Text variant="body" color={theme.semantic.text.secondary} testID="search-close-line">
        {closeLine(droppedWords(props.dropped, props.chips, props.words))}
      </Text>
      <PlainResults
        rows={props.rows}
        photos={props.photos}
        loading={false}
        heading={t({ id: 'search.close.heading', message: 'Close to that' })}
        softMisses={0}
        showingSoftMisses
        onSoftMisses={() => undefined}
        onOpen={props.onOpen}
        onAdd={props.onAdd}
        onMap={props.onMap}
      />
      {props.after}
    </View>
  );
}

export function PlainFailed({ onRetry }: { readonly onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space['8'] }} testID="search-plain-failed">
      <Text variant="body">
        {t({ id: 'search.plain.failed', message: 'That search didn’t come back.' })}
      </Text>
      <TextLink
        label={t({ id: 'search.link.retry', message: 'Try again' })}
        onPress={onRetry}
        testID="search-plain-retry"
      />
    </View>
  );
}
