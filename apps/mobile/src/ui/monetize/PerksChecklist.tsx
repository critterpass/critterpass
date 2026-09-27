import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useDeal } from '@/motion/patterns/deal';

import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface Perk {
  readonly id: string;
  /** Server-driven perk copy, rendered as sent. */
  readonly text: string;
  /** Check circle colour. @default state.success */
  readonly color?: string;
}

export interface PerksChecklistProps {
  /** The perk list from the server's entitlement config. */
  readonly perks: readonly Perk[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  circle: {
    width: th.space['24'],
    height: th.space['24'],
    borderRadius: th.space['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

function PerkRow({ perk, index }: { readonly perk: Perk; readonly index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const deal = useDeal({ active: true, index });
  return (
    <Animated.View style={deal}>
      <Row
        gap="10"
        align="center"
        accessible
        accessibilityRole="text"
        accessibilityLabel={perk.text}
      >
        <View
          style={[styles.circle, { backgroundColor: perk.color ?? theme.semantic.state.success }]}
        >
          <Icon
            name="check"
            size={theme.space['14']}
            decorative
            color={theme.semantic.text.onAccent}
          />
        </View>
        <Text variant="body" style={{ flex: 1 }}>
          {perk.text}
        </Text>
      </Row>
    </Animated.View>
  );
}

/** Perks as coloured check circles that tick on one at a time; the list is server-driven. */
export function PerksChecklist({ perks, testID }: PerksChecklistProps) {
  return (
    <Stack gap="10" testID={testID}>
      {perks.map((perk, index) => (
        <PerkRow key={perk.id} perk={perk} index={index} />
      ))}
    </Stack>
  );
}
