import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';

import { Scaffold, Stack, Text } from '@/ui';

export const __CP_DEV_ROUTE__ = true;

/** Stand-in destination for shell demos (FAB tap / long-press); shows which lookup fired. */
export default function ShellTargetScreen() {
  const { target } = useLocalSearchParams<{ target: string }>();
  return (
    <Scaffold testID={`shell-target-${target}`}>
      <Stack gap="12" padding="20">
        <Text variant="h2" accessibilityRole="header">
          {`Opened: ${target}`}
        </Text>
        <Pressable
          testID="shell-target-back"
          accessibilityRole="button"
          onPress={() => router.back()}
        >
          <Text variant="buttonSm">Back</Text>
        </Pressable>
      </Stack>
    </Scaffold>
  );
}
