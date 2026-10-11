/** A dietary choice (5.22): ink with white words when on, white with a soft shadow when off. */
import { PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

const useStyles = makePremiumStyles((th) => ({
  chip: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    justifyContent: 'center',
  },
  off: { backgroundColor: th.color.card, boxShadow: th.shadow.card },
}));

export function ChoiceChip({
  label,
  on,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  return (
    <PressableScale
      style={[styles.chip, on ? { backgroundColor: th.color.ink } : styles.off]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      testID={testID}
    >
      <Text variant="rowTextStrong" tone={on ? 'onInk' : 'ink'}>
        {label}
      </Text>
    </PressableScale>
  );
}
