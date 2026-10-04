/**
 * The add sheet's "More places" section (undesigned; logged in docs/undesigned-states.md): live
 * Foursquare results under the guide's own, headed like the sheet's other groups, each a result
 * row, with "Powered by Foursquare" under them as its terms require. A pick that cannot be saved
 * says why right under the row.
 */
import { t } from '@lingui/core/macro';
import { I18nManager, View } from 'react-native';

import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { ResultRow } from './add-sheet-view';
import type { LivePlace, MorePlacesState } from './more-places';

/** What became of the last pick: still asking, or why it cannot be added. */
export interface LivePickNote {
  readonly fsqPlaceId: string;
  readonly kind: 'resolving' | 'loading' | 'unavailable' | 'offline';
}

const useStyles = makeStyles((th) => ({
  section: { gap: th.space['10'] },
}));

function noteText(kind: LivePickNote['kind'], place: string): string {
  switch (kind) {
    case 'resolving':
      return t({ id: 'setup.addMustDo.more.resolving', message: 'Getting this place ready…' });
    case 'loading':
      return t({
        id: 'setup.addMustDo.more.loading',
        message: `We’re still gathering places in ${place}. Try this one again in a few minutes.`,
      });
    case 'offline':
      return t({
        id: 'setup.addMustDo.more.offline',
        message: 'No signal. Try again when you’re back online.',
      });
    case 'unavailable':
      return t({
        id: 'setup.addMustDo.more.unavailable',
        message:
          'This place can’t be saved: CritterPass keeps only places from open map data. Keep it in your own words instead.',
      });
  }
}

export function MorePlacesSection({
  state,
  note,
  destinationName,
  onPick,
}: {
  readonly state: MorePlacesState;
  readonly note: LivePickNote | null;
  readonly destinationName: string;
  readonly onPick: (place: LivePlace) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  if (state.kind === 'none' || (state.kind === 'done' && state.places.length === 0)) return null;
  return (
    <View style={styles.section} testID="add-must-do-more">
      <Text variant="eyebrow">
        {t({ id: 'setup.addMustDo.more.title', message: 'More places' })}
      </Text>
      {state.kind === 'loading' ? (
        <Skeleton
          preset="list"
          repeat={1}
          label={t({ id: 'setup.addMustDo.more.searching', message: 'Looking further' })}
        />
      ) : (
        <>
          {state.places.map((place) => (
            <View key={place.fsqPlaceId} style={styles.section}>
              <ResultRow
                title={place.name}
                line={place.address}
                trailing={
                  <Text variant="title" color={theme.semantic.text.secondary}>
                    {I18nManager.isRTL ? '‹' : '›'}
                  </Text>
                }
                onPress={() => onPick(place)}
                label={[place.name, place.address].filter(Boolean).join(', ')}
                testID={`add-must-do-more-${place.fsqPlaceId}`}
              />
              {note?.fsqPlaceId === place.fsqPlaceId ? (
                <Text
                  variant="caption"
                  color={theme.semantic.text.secondary}
                  testID="add-must-do-more-note"
                >
                  {noteText(note.kind, destinationName)}
                </Text>
              ) : null}
            </View>
          ))}
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({ id: 'setup.addMustDo.more.attribution', message: 'Powered by Foursquare' })}
          </Text>
        </>
      )}
    </View>
  );
}
