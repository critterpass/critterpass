import { LegendList } from '@legendapp/list';
import { router } from 'expo-router';
import { View } from 'react-native';

import { RootScreen, ZoomLink } from '@/ui/premium/shell';
import { IconButton } from '@/ui/premium';

import { DEMO_ROWS, DemoRowView } from '../../demo-rows';

export const __CP_DEV_ROUTE__ = true;

/**
 * Root screen over a LegendList with the native large title. The `+` is a React Native view in a
 * toolbar slot wrapped in the system zoom, so iOS 26 can morph the half sheet out of it (spike);
 * the ⋯ opens the push screen.
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
          element: (
            <ZoomLink
              href="/(dev)/premium-shell/add"
              zoomId="demo-add"
              accessibilityLabel="Add a booking"
              testID="premium-shell-plus"
            >
              <View pointerEvents="none">
                <IconButton icon="plus" label="Add a booking" tone="ink" size={36} />
              </View>
            </ZoomLink>
          ),
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
