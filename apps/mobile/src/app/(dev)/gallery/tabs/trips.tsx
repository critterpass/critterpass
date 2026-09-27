import { ScrollView } from 'react-native';

import { Scaffold, Stack, Text } from '@/ui';
import { useTabBarInset } from '@/ui/shell/TabBar';

export const __CP_DEV_ROUTE__ = true;

export default function TripsTabDemo() {
  const bottom = useTabBarInset();
  return (
    <Scaffold testID="gallery-tab-trips">
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <Stack gap="8" padding="20">
          <Text variant="h1" accessibilityRole="header">
            Trips
          </Text>
          <Text variant="body">Tab demo screen</Text>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
