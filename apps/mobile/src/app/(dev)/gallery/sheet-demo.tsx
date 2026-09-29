import { Row, Stack, Text } from '@/ui';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

export const __CP_DEV_ROUTE__ = true;

const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);

/**
 * Sheet demo: medium and large detents over the gallery, with scrollable content, and a header row
 * (a long title and a trailing action) sharing its line with the ✕.
 */
export default function SheetDemoScreen() {
  return (
    <Sheet
      detents={['medium', 'large']}
      initialDetent="medium"
      accessibilityLabel="Sheet demo"
      header={
        <Row gap="12" justify="space-between">
          <Text
            variant="h2"
            accessibilityRole="header"
            autoFit
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            Your crews and trips
          </Text>
          <InlineAction label="Join with a code" onPress={() => undefined} />
        </Row>
      }
    >
      <SheetScrollView testID="sheet-demo-scroll">
        <Stack gap="12" padding="20">
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
