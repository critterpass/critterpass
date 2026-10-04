/**
 * One way out of a split (7e-3 "KEEN ONES GO EARLY", "TIRTA GANGGA INSTEAD"): a radio, a title, what
 * it means for the crew, and tags with its cost and who goes. The chosen one is outlined in yellow.
 */
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface OptionRadioCardProps {
  readonly title: string;
  readonly body?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly testID?: string | undefined;
}

const RADIO = 22;

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    gap: t.space['12'],
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
  },
  chosen: { borderColor: t.semantic.action.primary },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    borderColor: t.semantic.border.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: t.space['2'],
  },
  radioOn: { borderColor: t.semantic.action.primary },
  pip: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.semantic.action.primary },
  body: { flex: 1, minWidth: 0, gap: t.space['4'] },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['6'], marginTop: t.space['4'] },
  tag: {
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.sunken,
  },
}));

export function OptionRadioCard({
  title,
  body,
  tags = [],
  selected,
  onSelect,
  testID,
}: OptionRadioCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={[title, body, ...tags].filter((part) => part !== undefined).join(', ')}
      accessibilityState={{ selected }}
      testID={testID}
    >
      <View style={[styles.card, selected ? styles.chosen : null]}>
        <View style={[styles.radio, selected ? styles.radioOn : null]}>
          {selected ? <View style={styles.pip} /> : null}
        </View>
        <View style={styles.body}>
          <Text variant="title">{title}</Text>
          {body === undefined ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {body}
            </Text>
          )}
          {tags.length === 0 ? null : (
            <View style={styles.tags}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text variant="label">{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </PressScale>
  );
}
