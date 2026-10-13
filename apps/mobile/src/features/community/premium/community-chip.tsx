/**
 * A filter or choice chip on the community pages: white on the ground, ink when on, with the
 * kit's press scale. The premium set draws chips this way in its segmented rows.
 */
import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export function CommunityChip({
  label,
  selected,
  onPress,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      testID={testID}
      style={{
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: th.space.gap14,
        borderRadius: th.radius.pillSmall,
        backgroundColor: selected ? th.color.ink : th.color.card,
        ...(selected ? {} : { boxShadow: th.shadow.card }),
        opacity: disabled ? th.opacity.disabled : 1,
      }}
    >
      <Text variant="pillSmall" tone={selected ? 'onInk' : 'ink'} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}
