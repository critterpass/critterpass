/**
 * A plain-words question answered on Find (4.31, 4.33): asked once (keyed by it), the chips the
 * guide read with × to take one off, the guide's note on what the plan left out, then the places
 * with their fit lines, the closest places when nothing matched all of it, or the ways out when
 * there are none. A search that failed says so with a retry, never "0 places".
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, Text, usePremiumTheme } from '@/ui/premium';

import { usePlainBlock, type PlainBlockInput } from '../../search/use-plain-block';
import { usePlainSection } from '../../search/use-plain-section';
import { FindNoResults } from './find-no-results';
import { ChipRow, ClosePlacesList, PlainList, PlainNote } from './find-plain';

export interface FindAnswerProps extends PlainBlockInput {
  /** Where the search looked ("Ubud"), for "Nothing like that near Ubud". */
  readonly area: string;
  /** The search looked at the whole destination, not around a place. */
  readonly whole: boolean;
  readonly onOpen: (poiId: string) => void;
  readonly onAdd: (poiId: string, name: string) => void;
  readonly onAsk: () => void;
  /** Street addresses for the question, under the places or above the ways out. */
  readonly addresses?: ReactNode;
}

export function FindAnswer(props: FindAnswerProps) {
  const theme = usePremiumTheme();
  const { trip } = props;
  const { state, remove, retry, words, onMap, wayOut, limitMinutes } = usePlainBlock(props);
  const section = usePlainSection(state, trip);
  const critter = guideSticker(trip.guide).kind;
  if (section.failed) {
    return (
      <View style={{ gap: theme.space.gap12 }} testID="search-plain-failed">
        <Text variant="body">
          {t({ id: 'search.plain.failed', message: 'That search didn’t come back.' })}
        </Text>
        <Button
          label={t({ id: 'search.link.retry', message: 'Try again' })}
          size="small"
          variant="secondary"
          onPress={retry}
          testID="search-plain-retry"
        />
        {props.addresses}
      </View>
    );
  }
  const mapOf = (keys: readonly string[]) => (onMap === undefined ? undefined : () => onMap(keys));
  return (
    <View style={{ gap: theme.space.gap16 }}>
      <ChipRow chips={state.chips} words={words} guideName={trip.guideName} onRemove={remove} />
      <PlainNote note={section.note} guideName={trip.guideName} critter={critter} />
      {section.close !== null ? (
        <>
          <ClosePlacesList
            rows={section.closeRows}
            photos={section.closePhotos}
            dropped={section.close.dropped}
            chips={state.chips}
            words={words}
            onOpen={props.onOpen}
            onAdd={props.onAdd}
            onMap={mapOf(section.closeRows.map((row) => row.key))}
          />
          {props.addresses}
        </>
      ) : section.empty && section.answer !== null ? (
        <FindNoResults
          answer={section.answer}
          area={props.area}
          whole={props.whole}
          limitMinutes={limitMinutes}
          guideName={trip.guideName}
          critter={critter}
          onWayOut={wayOut}
          onAsk={props.onAsk}
          addresses={props.addresses}
        />
      ) : (
        <>
          <PlainList
            rows={section.rows}
            photos={section.photos}
            loading={state.search === 'loading' || state.parse === 'parsing'}
            softMisses={section.answer?.softMisses.length ?? 0}
            showingSoftMisses={section.softShown}
            onSoftMisses={section.showSoftMisses}
            onOpen={props.onOpen}
            onAdd={props.onAdd}
            onMap={mapOf(section.rows.map((row) => row.key))}
          />
          {props.addresses}
        </>
      )}
    </View>
  );
}
