import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';

import { Scaffold, Stack, Text } from '@/ui';
import { SharedTarget } from '@/ui/transitions/SharedGrow';

export const __CP_DEV_ROUTE__ = true;

/** Zoom destination: the detail the demo card grows into. */
export default function ZoomDetailScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
  return (
    <Scaffold testID="zoom-detail">
      <SharedTarget id={id}>
        <Stack gap="12" padding="20">
          <Pressable
            testID="zoom-detail-back"
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text variant="eyebrow">Back</Text>
          </Pressable>
          <Text variant="h1" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body">Detail content lands here once the card has grown into place.</Text>
        </Stack>
      </SharedTarget>
    </Scaffold>
  );
}
