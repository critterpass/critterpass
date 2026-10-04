/**
 * PICK ONE (7d-3, undesigned): the up-to-three places a mention could be, as a sheet; picking one
 * ticks it for saving.
 */
import type { ImportCandidate } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { makeStyles } from '@/ui';
import { PlaceRow } from '@/ui/planning';
import { Sheet } from '@/ui/sheet/Sheet';

import { placeIcon } from './place-icons';

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingBottom: th.space['24'] },
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
}));

export interface PickOneSheetProps {
  readonly label: string;
  readonly candidates: readonly ImportCandidate[];
  /** The candidates' photos by POI id, as they arrive. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly onPick: (poiId: string) => void;
  readonly onClose: () => void;
}

export function PickOneSheet({ label, candidates, photos, onPick, onClose }: PickOneSheetProps) {
  const styles = useStyles();
  const title = t({ id: 'search.link.pickTitle', message: `Which is “${label}”?` });
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="search-pick-one"
    >
      <View style={styles.body}>
        <View style={styles.card}>
          {candidates.map((candidate, index) => (
            <PlaceRow
              key={candidate.poi_id}
              title={candidate.name}
              meta={candidate.meta ?? undefined}
              icon={placeIcon(candidate.category)}
              {...photos?.get(candidate.poi_id)}
              onPress={() => onPick(candidate.poi_id)}
              testID={`search-pick-${String(index)}`}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}
