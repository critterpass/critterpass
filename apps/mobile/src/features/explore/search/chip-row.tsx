/**
 * "TOKEK READ IT AS" (7d-2): the parse's chips, each with × to take it off, and the guide's line
 * on what the plan left out ("Wednesday's already Locavore, so I looked at your other nights.").
 * Words come from the app's own templates on the chip codes, never from the model.
 */
import type { SearchChip } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';
import { makeStyles, Text, useTheme } from '@/ui';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';

import { GuideSticker } from './guide-sticker';
import { chipLabel, type ChipWords } from './chip-words';
import { chipKey } from './plain-filters';

export { categoryWord, chipLabel, excludeLine, onlyDayLeft, type ChipWords } from './chip-words';

const CROSS = '×';

const useStyles = makeStyles((th) => ({
  block: { gap: th.space['10'] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingStart: th.space['14'],
    borderRadius: 18,
  },
  remove: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
}));

function removeLabel(label: string): string {
  return t({ id: 'search.chip.remove', message: `Remove ${label}` });
}

export interface ChipBlockProps {
  readonly chips: readonly SearchChip[];
  readonly words: ChipWords;
  readonly note: string | null;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly onRemove: (key: string) => void;
}

export function ChipBlock({ chips, words, note, guide, guideName, onRemove }: ChipBlockProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (chips.length === 0) return null;
  return (
    <View style={styles.block} testID="search-chips">
      <Text variant="eyebrow">
        {t({ id: 'search.chips.eyebrow', message: `${guideName} read it as` })}
      </Text>
      <View style={styles.wrap}>
        {chips.map((chip) => {
          const key = chipKey(chip);
          const label = chipLabel(chip, words);
          const lit = chip.code === 'exclude_days';
          const ink = lit ? theme.semantic.text.onAccent : theme.semantic.text.primary;
          return (
            <View
              key={key}
              style={[
                styles.chip,
                { backgroundColor: lit ? tokens.color.yellow : theme.semantic.bg.raised },
              ]}
              testID={`chip-${key}`}
            >
              <Text variant="label" color={ink} numberOfLines={1}>
                {label}
              </Text>
              <PressScale
                widthClass="narrow"
                accessibilityRole="button"
                accessibilityLabel={removeLabel(label)}
                onPress={() => onRemove(key)}
                style={styles.remove}
                testID={`chip-${key}-remove`}
              >
                <Text variant="label" color={ink}>
                  {CROSS}
                </Text>
              </PressScale>
            </View>
          );
        })}
      </View>
      {note === null ? null : (
        <GuideLine
          guide={guide}
          name={guideName}
          line={note}
          sticker={<GuideSticker guide={guide} />}
        />
      )}
    </View>
  );
}
