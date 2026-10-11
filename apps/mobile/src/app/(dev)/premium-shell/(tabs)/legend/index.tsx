import { LegendList } from '@legendapp/list/react-native';
import { router } from 'expo-router';

import { RootScreen } from '@/ui/premium/shell';

import { DEMO_ROWS, DemoRowView } from '../../demo-rows';

export const __CP_DEV_ROUTE__ = true;

/**
 * Root screen over a LegendList with the native large title. The `+` is the system toolbar button
 * and grows into the half sheet (the shell's drawn 1.06 morph); the ⋯ opens the push screen.
 */
export default function LegendTab() {
  return (
    <RootScreen
      title="Legend"
      testID="premium-shell-legend"
      actions={[
        {
          key: 'more',
          label: 'More',
          sfSymbol: 'ellipsis',
          glyph: 'more',
          onPress: () => router.push('/(dev)/premium-shell/push'),
        },
        {
          key: 'add',
          label: 'Add a booking',
          sfSymbol: 'plus',
          glyph: 'plus',
          primary: true,
          onPress: () => router.push('/(dev)/premium-shell/add'),
          morph: true,
        },
      ]}
    >
      {({ scrollProps, largeTitle }) => (
        <LegendList
          {...scrollProps}
          testID="premium-shell-legend-list"
          data={DEMO_ROWS}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => <DemoRowView row={item} />}
          ListHeaderComponent={largeTitle}
          estimatedItemSize={72}
          recycleItems
        />
      )}
    </RootScreen>
  );
}
