/**
 * A filter or choice chip on the community pages: the kit chip, white on the ground, ink when on.
 */
import { Chip } from '@/ui/premium';

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
  return (
    <Chip
      label={label}
      selected={selected}
      onPress={onPress}
      disabled={disabled}
      surface="white"
      testID={testID}
    />
  );
}
