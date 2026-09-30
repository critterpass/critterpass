/** The supplier lab's sheets, presented like their routes (same titles and detents). */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

export type LabSheetKind = 'book' | 'cancel' | 'draft' | 'messages';

export function LabSheet({
  kind,
  children,
}: {
  readonly kind: LabSheetKind;
  readonly children: ReactNode;
}) {
  const { t } = useLingui();
  const title =
    kind === 'book'
      ? t({ id: 'suppliers.book.title', message: 'Book with Viator' })
      : kind === 'cancel'
        ? t({ id: 'suppliers.cancel.title', message: 'Cancel with Viator' })
        : kind === 'draft'
          ? t({ id: 'suppliers.vendor.draftTitle', message: 'Message to a place' })
          : t({ id: 'suppliers.vendor.listTitle', message: 'Messages to places' });
  return (
    <Sheet
      detents={[kind === 'cancel' ? 'fit' : 'large']}
      title={title}
      testID={`supplier-lab-sheet-${kind}`}
    >
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      >
        {children}
      </SheetScrollView>
    </Sheet>
  );
}
