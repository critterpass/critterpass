/** A dietary choice (5.22): the kit chip, ink with white words when on, white when off. */
import { Chip } from '@/ui/premium';

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
  return (
    <Chip
      label={label}
      selected={on}
      onPress={onPress}
      size="hub"
      surface="white"
      accessibilityRole="checkbox"
      testID={testID}
    />
  );
}
