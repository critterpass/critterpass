/** Supplier lab scenes for messages to places: writing one and every state of a thread. */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { ALL_PARTNERS_OFF, supplierCopy } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import { useSupplierCopy } from '../copy';
import { VendorDraftCard, type DraftOutcome } from '../VendorDraftCard';
import { LabSheet, type LabSheetKind } from './lab-sheet';
import { VendorThreadCard } from '../VendorThreadCard';

const noop = () => undefined;
const TEXT =
  'Hi Locavore, could you hold a table for 6 tonight at 19:30? We might run up to 21:00. Thanks, Rin';

function sheet(children: ReactNode, kind: LabSheetKind) {
  return <LabSheet kind={kind}>{children}</LabSheet>;
}

function DraftScene({ outcome }: { readonly outcome: DraftOutcome['kind'] }) {
  const { t } = useLingui();
  const [open, close, tz] = ['07:00', '23:00', 'SGT'];
  const note = t({
    id: 'suppliers.vendor.deskHours',
    message: `The desk sends messages between ${open} and ${close} (${tz}).`,
  });
  return sheet(
    <VendorDraftCard
      vendor="Locavore"
      text={TEXT}
      onText={noop}
      outcome={
        outcome === 'approved'
          ? { kind: 'approved', note }
          : outcome === 'self_send'
            ? { kind: 'self_send' }
            : { kind: 'editing' }
      }
      busy={false}
      error={null}
      onSend={noop}
      onShare={noop}
      onDone={noop}
    />,
    'draft',
  );
}

function ThreadsScene() {
  const { t } = useLingui();
  const render = useSupplierCopy();
  const vendor = 'Locavore';
  const [open, close, tz] = ['07:00', '23:00', 'SGT'];
  return sheet(
    <Stack gap="12" testID="vendor-threads">
      <VendorThreadCard
        vendor="Made (driver)"
        phase="draft"
        line={render(
          supplierCopy(
            { action: 'vendor', state: 'draft_ready', vendor: 'Made' },
            ALL_PARTNERS_OFF,
          ),
        )}
        body="Hi Made, our flight is 2h late. Could you pick us up at 13:50 instead of 11:40?"
        onSend={noop}
        testID="vendor-thread-draft"
      />
      <VendorThreadCard
        vendor={vendor}
        phase="approved"
        line={t({ id: 'suppliers.vendor.approvedLine', message: 'Approved · the desk sends it' })}
        body={TEXT}
        note={t({
          id: 'suppliers.vendor.deskHours',
          message: `The desk sends messages between ${open} and ${close} (${tz}).`,
        })}
      />
      <VendorThreadCard
        vendor="Villa Kayu Manis"
        phase="waiting"
        line={render(
          supplierCopy(
            { action: 'vendor', state: 'sent', vendor: 'Villa', time: '10:45' },
            ALL_PARTNERS_OFF,
          ),
        )}
        body="Hi, we'll arrive around 15:30 instead of 13:00. Is late check-in fine?"
      />
      <VendorThreadCard
        vendor="Made (driver)"
        phase="replied"
        line={render(
          supplierCopy(
            { action: 'vendor', state: 'replied', vendor: 'Made', reply: 'ok 13:50 bisa' },
            ALL_PARTNERS_OFF,
          ),
        )}
        body={null}
      />
      <VendorThreadCard
        vendor="Warung Biah Biah"
        phase="self_send"
        line={render(
          supplierCopy(
            { action: 'vendor', state: 'draft_ready', vendor: 'Warung Biah Biah' },
            ALL_PARTNERS_OFF,
          ),
        )}
        body="Hi, do you have a table for 6 at 19:00?"
        onShare={noop}
      />
      <VendorThreadCard
        vendor="Tirta Spa"
        phase="failed"
        line={t({
          id: 'suppliers.vendor.failedLine',
          message: 'It didn’t reach them on WhatsApp. The desk will tell you what next.',
        })}
        body="Hi, can we move our 16:00 massage to 17:00?"
      />
    </Stack>,
    'messages',
  );
}

function ListEmptyScene() {
  const { t } = useLingui();
  return sheet(
    <Text variant="body" testID="vendor-threads-empty">
      {t({
        id: 'suppliers.vendor.empty',
        message: 'No messages to places yet. When you ask a place something, it shows here.',
      })}
    </Text>,
    'messages',
  );
}

export const VENDOR_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'vendor-draft': () => <DraftScene outcome="editing" />,
  'vendor-draft-approved': () => <DraftScene outcome="approved" />,
  'vendor-draft-self-send': () => <DraftScene outcome="self_send" />,
  'vendor-threads': () => <ThreadsScene />,
  'vendor-threads-empty': () => <ListEmptyScene />,
};
