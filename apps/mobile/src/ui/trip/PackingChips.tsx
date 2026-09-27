import { View } from 'react-native';

import { GrowBar } from '../data/LinearBar';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PackingItem {
  readonly id: string;
  readonly label: string;
  readonly packed: boolean;
}

export interface PackingChipsProps {
  readonly items: readonly PackingItem[];
  readonly onToggle: (id: string) => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  chip: {
    borderRadius: th.size.chip.height,
    paddingHorizontal: th.space['14'],
    justifyContent: 'center',
    borderWidth: th.space['2'],
  },
  strike: {
    position: 'absolute',
    start: th.space['12'],
    end: th.space['12'],
    top: '50%',
    height: th.space['2'],
  },
}));

/** Packing list as checkbox chips; packed items get a pen-stroke strike and a check. */
export function PackingChips({ items, onToggle, testID }: PackingChipsProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Row gap="8" wrap testID={testID}>
      {items.map((item) => (
        <PressScale
          key={item.id}
          accessibilityRole="checkbox"
          accessibilityLabel={item.label}
          accessibilityState={{ checked: item.packed }}
          onPress={() => onToggle(item.id)}
          widthClass="narrow"
          style={[
            styles.chip,
            item.packed
              ? {
                  backgroundColor: theme.semantic.bg.control,
                  borderColor: theme.semantic.bg.control,
                }
              : {
                  backgroundColor: theme.semantic.bg.base,
                  borderColor: theme.semantic.action.primary,
                },
          ]}
        >
          <Row gap="6" align="center">
            {item.packed ? (
              <Icon
                name="check"
                size={theme.space['16']}
                decorative
                color={theme.semantic.state.success}
              />
            ) : null}
            <Text
              variant="buttonSm"
              color={item.packed ? theme.semantic.text.secondary : theme.semantic.action.primary}
            >
              {item.label}
            </Text>
          </Row>
          {item.packed ? (
            <View style={styles.strike} pointerEvents="none">
              <GrowBar fraction={1} color={theme.semantic.text.secondary} />
            </View>
          ) : null}
        </PressScale>
      ))}
    </Row>
  );
}
