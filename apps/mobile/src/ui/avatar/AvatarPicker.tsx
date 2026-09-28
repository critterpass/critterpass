import { View } from 'react-native';

import { Sticker } from '../sticker/Sticker';
import { PressScale } from '../press/PressScale';
import { makeStyles, useTheme } from '../theme';
import { GUIDE_AVATAR_IDS, GUIDE_STICKERS, type GuideAvatarId } from './guides';

export interface AvatarPickerProps {
  readonly selected: GuideAvatarId | null;
  readonly onPick: (guide: GuideAvatarId) => void;
  /** Accessible name per guide ("Tokek"); defaults to the guide's name. */
  readonly labelFor?: (guide: GuideAvatarId) => string;
  readonly testID?: string;
}

const CELL = 84;
const RING = 6;

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  cell: { width: '33%', alignItems: 'center' },
  circle: {
    width: CELL + RING * 2,
    height: CELL + RING * 2,
    borderRadius: (CELL + RING * 2) / 2,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.raised,
  },
}));

/** The 3×2 guide grid of 3a-3 (and 3n-4's guide row): the picked guide wears a 6 pt yellow ring. */
export function AvatarPicker({ selected, onPick, labelFor, testID }: AvatarPickerProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.grid} testID={testID} accessibilityRole="radiogroup">
      {GUIDE_AVATAR_IDS.map((id) => {
        const guide = GUIDE_STICKERS[id];
        const isSelected = selected === id;
        return (
          <View key={id} style={styles.cell}>
            <PressScale
              onPress={() => onPick(id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={labelFor ? labelFor(id) : guide.name}
              widthClass="narrow"
              testID={testID ? `${testID}-${id}` : undefined}
            >
              <View
                style={[
                  styles.circle,
                  { borderColor: isSelected ? theme.color.yellow : 'transparent' },
                ]}
              >
                <Sticker kind={guide.kind} name={guide.name} size={CELL - 16} />
              </View>
            </PressScale>
          </View>
        );
      })}
    </View>
  );
}
