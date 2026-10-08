/** The PICK buttons under the comparison, one per driver column. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { useTheme } from '@/ui/theme';

import type { ShortlistDriver } from '../shared/api';

export function PickRow(props: {
  readonly drivers: readonly ShortlistDriver[];
  readonly width: number;
  readonly onPick: (driverId: string) => void;
}) {
  const { t } = useLingui();
  const theme = useTheme();
  return (
    <Row gap="8" style={{ marginTop: theme.space['12'] }}>
      {props.drivers.map((driver) => (
        <View key={driver.id} style={{ width: props.width }}>
          <PillButton
            label={t({ id: 'drivers.compare.pick', message: 'Pick' })}
            tone="yellow"
            size="sm"
            block
            onPress={() => props.onPick(driver.id)}
            testID={`drivers-compare-pick-${driver.id}`}
          />
        </View>
      ))}
    </Row>
  );
}
