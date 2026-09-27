import { Stack, Text } from '@/ui';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

export const __CP_DEV_ROUTE__ = true;

const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);

/** Sheet demo: medium and large detents over the gallery, with scrollable content. */
export default function SheetDemoScreen() {
  return (
    <Sheet detents={['medium', 'large']} initialDetent="medium" accessibilityLabel="Sheet demo">
      <SheetScrollView testID="sheet-demo-scroll">
        <Stack gap="12" padding="20">
          <Text variant="h2" accessibilityRole="header">
            Sheet demo
          </Text>
          {ROWS.map((row) => (
            <Text key={row} variant="body" testID={`sheet-demo-${row}`}>
              {row}
            </Text>
          ))}
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
