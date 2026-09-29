import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface Segment<Value extends string> {
  readonly value: Value;
  readonly label: string;
  /** Small count badge after the label ("Invites 3"). */
  readonly badge?: number;
}

export interface SegmentedProps<Value extends string> {
  /** 2–4 segments. */
  readonly segments: readonly Segment<Value>[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  /** Group name read before the options ("How chatty"). */
  readonly label: string;
  /** Leading caption inside the track ("Split"). */
  readonly caption?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.semantic.bg.control,
    borderRadius: sizeToken(t.size.chip, 'hitTarget') / 2,
    padding: t.space['4'],
    gap: t.space['4'],
  },
  caption: { paddingHorizontal: t.space['10'] },
  // Content-weighted: each segment starts at its label's width and the spare room is shared, so a
  // longer label ("NEEDS YOU · 3") takes more of the track instead of wrapping.
  segment: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    flexDirection: 'row',
    gap: t.space['4'],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: sizeToken(t.size.chip, 'hitTarget') / 2,
    paddingHorizontal: t.space['8'],
  },
  badge: {
    minWidth: 18,
    paddingHorizontal: t.space['4'],
    borderRadius: 9,
    backgroundColor: t.semantic.state.urgent,
    alignItems: 'center',
  },
}));

/** Pill segmented control (2–4 options); each option is a radio with checked state. */
export function Segmented<Value extends string>({
  segments,
  value,
  onChange,
  label,
  caption,
  testID,
}: SegmentedProps<Value>) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {caption ? (
        <Text variant="label" color={theme.semantic.text.secondary} style={styles.caption}>
          {caption}
        </Text>
      ) : null}
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <PressScale
            key={segment.value}
            onPress={() => onChange(segment.value)}
            widthClass="narrow"
            accessibilityRole="radio"
            accessibilityLabel={
              segment.badge ? `${segment.label}, ${segment.badge}` : segment.label
            }
            accessibilityState={{ checked: selected }}
            style={[
              styles.segment,
              selected ? { backgroundColor: theme.semantic.action.primary } : null,
            ]}
          >
            <Text
              variant="label"
              color={selected ? theme.semantic.text.onAccent : theme.semantic.text.secondary}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
            {segment.badge ? (
              <View style={styles.badge}>
                <Text variant="label" color={theme.semantic.text.onAccent}>
                  {String(segment.badge)}
                </Text>
              </View>
            ) : null}
          </PressScale>
        );
      })}
    </View>
  );
}
