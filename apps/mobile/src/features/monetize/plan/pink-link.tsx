/** The pink sentence-case link that leaves a plan ("Cancel Pass+", "Cancel anyway"). */
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export interface PinkLinkProps {
  readonly label: string;
  readonly onPress: () => void;
  /** Where the link sits in its column. @default 'start' */
  readonly align?: 'start' | 'centre';
  readonly testID: string;
}

export function PinkLink({ label, onPress, align = 'start', testID }: PinkLinkProps) {
  const theme = useTheme();
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      widthClass="medium"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ alignSelf: align === 'start' ? 'flex-start' : 'center', justifyContent: 'center' }}
    >
      <Text variant="rowTitle" color={theme.color.pink}>
        {label}
      </Text>
    </PressScale>
  );
}
