import { useLocale } from '@/lib/i18n/use-locale';
import { Stack, Text } from '@/ui';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

export const __CP_DEV_ROUTE__ = true;

const ROWS = Array.from({ length: 30 }, (_, index) => `Row ${index + 1}`);

/** The crews sheet's own copy (3g-3) in the gallery's language; the Vietnamese title runs longer. */
const COPY = {
  en: { title: 'Your crews', join: 'Join with a code' },
  vi: { title: 'Nhóm của bạn', join: 'Vào bằng mã' },
} as const;

/**
 * Sheet demo: medium and large detents over the gallery, with scrollable content, headed like the
 * crews sheet (3g-3): a title that wraps beside its trailing action and the ✕.
 */
export default function SheetDemoScreen() {
  const locale = useLocale();
  const copy = locale.startsWith('vi') ? COPY.vi : COPY.en;
  return (
    <Sheet
      detents={['medium', 'large']}
      initialDetent="medium"
      accessibilityLabel="Sheet demo"
      title={copy.title}
      headerEnd={<HeaderPill label={copy.join} onPress={() => undefined} />}
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
