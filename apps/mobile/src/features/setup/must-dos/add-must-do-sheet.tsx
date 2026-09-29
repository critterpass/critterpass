/** The add-a-must-do sheet (3c-10). */
import { t } from '@lingui/core/macro';

import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';

export function AddMustDoSheet({ tripId }: { readonly tripId: string }) {
  return (
    <Sheet
      accessibilityLabel={t({ id: 'setup.addMustDo.title', message: 'Add a must-do' })}
      testID={`setup-add-must-do-${tripId}`}
    >
      <Text variant="eyebrow">{t({ id: 'setup.addMustDo.title', message: 'Add a must-do' })}</Text>
    </Sheet>
  );
}
