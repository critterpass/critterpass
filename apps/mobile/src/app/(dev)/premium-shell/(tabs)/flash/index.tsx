import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';

import { RootScreen } from '@/ui/premium/shell';

import { DEMO_ROWS, DemoRowView } from '../../demo-rows';

export const __CP_DEV_ROUTE__ = true;

/** Root screen over a FlashList with the native large title and a plain toolbar `+`. */
export default function FlashTab() {
  return (
    <RootScreen
      title="Flash"
      testID="premium-shell-flash"
      actions={[
        {
          key: 'add',
          label: 'Add a booking',
          sfSymbol: 'plus',
          glyph: 'plus',
          primary: true,
          onPress: () => router.push('/(dev)/premium-shell/add'),
        },
      ]}
    >
      {({ scrollProps, largeTitle }) => (
        <FlashList
          {...scrollProps}
          testID="premium-shell-flash-list"
          data={DEMO_ROWS}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => <DemoRowView row={item} />}
          ListHeaderComponent={largeTitle}
        />
      )}
    </RootScreen>
  );
}
