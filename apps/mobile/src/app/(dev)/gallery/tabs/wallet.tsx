import { ScrollView } from 'react-native';

import { Scaffold, Stack, Text } from '@/ui';
import { useTabBarInset } from '@/ui/shell/TabBar';

export const __CP_DEV_ROUTE__ = true;

export default function WalletTabDemo() {
  const bottom = useTabBarInset();
  return (
    <Scaffold testID="gallery-tab-wallet">
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <Stack gap="8" padding="20">
          <Text variant="h1" accessibilityRole="header">
            Wallet
          </Text>
          <Text variant="body">Tab demo screen</Text>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
