import { Stack, Text } from '@/ui';
import { RiseModal } from '@/ui/sheet/RiseModal';

export const __CP_DEV_ROUTE__ = true;

/** Rise demo: a full-screen modal over the gallery (paywall/checkout presentation). */
export default function RiseDemoScreen() {
  return (
    <RiseModal variant="paper" accessibilityLabel="Rise demo">
      <Stack gap="12" padding="20">
        <Text variant="h1" accessibilityRole="header">
          Rise demo
        </Text>
        <Text variant="body">Drag down from the top, tap the close button or press back.</Text>
      </Stack>
    </RiseModal>
  );
}
