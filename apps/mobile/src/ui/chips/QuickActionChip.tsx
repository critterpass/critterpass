import { View } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface QuickActionChipProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: DoodleName;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  target: { justifyContent: 'center', alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row',
    gap: t.space['6'],
    alignItems: 'center',
    minHeight: sizeToken(t.size.chip, 'height'),
    borderRadius: sizeToken(t.size.chip, 'height') / 2,
    paddingHorizontal: t.space['12'],
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 1.5,
    borderColor: t.semantic.border.decorative,
  },
}));

/** A one-tap suggestion under the composer or a guide line ("Find a café", "Split it"). */
export function QuickActionChip({ label, onPress, icon, testID }: QuickActionChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      widthClass="narrow"
      accessibilityLabel={label}
      style={styles.target}
    >
      <View style={styles.chip}>
        {icon ? <Icon name={icon} size={16} decorative /> : null}
        <Text variant="bodySm" color={theme.semantic.text.primary}>
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
