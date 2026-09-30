/**
 * The three ways in (3h-2): FORWARD any email, SCAN paper or a screen, PASTE a link or code, and
 * the crew's forward address with COPY (the label flips to COPIED, and a toast says what to do
 * with it). The empty wallet shows the same tiles inline.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { TileGrid } from '@/ui/cards/TileGrid';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

export type ImportChannel = 'forward' | 'scan' | 'paste';

const COPIED_MS = 2000;

const useStyles = makeStyles((t) => ({
  pill: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
    borderRadius: t.radius.lg,
    paddingStart: t.space['16'],
    paddingEnd: t.space['10'],
    paddingVertical: t.space['10'],
  },
  address: { flex: 1 },
}));

export function ImportTiles({ onChannel }: { readonly onChannel: (c: ImportChannel) => void }) {
  const { t } = useLingui();
  const locale = useLocale();
  return (
    <TileGrid
      columns={3}
      tiles={[
        {
          key: 'forward',
          title: upper(t({ id: 'bookings.add.forward', message: 'Forward' }), locale),
          caption: t({ id: 'bookings.add.forwardCaption', message: 'Any email' }),
          icon: 'chat',
          tone: 'yellow',
          onPress: () => onChannel('forward'),
        },
        {
          key: 'scan',
          title: upper(t({ id: 'bookings.add.scan', message: 'Scan' }), locale),
          caption: t({ id: 'bookings.add.scanCaption', message: 'Paper or screen' }),
          icon: 'camera',
          tone: 'pink',
          onPress: () => onChannel('scan'),
        },
        {
          key: 'paste',
          title: upper(t({ id: 'bookings.add.paste', message: 'Paste' }), locale),
          caption: t({ id: 'bookings.add.pasteCaption', message: 'A link or code' }),
          icon: 'ticket',
          tone: 'blue',
          onPress: () => onChannel('paste'),
        },
      ]}
    />
  );
}

export function AddressPill({
  address,
  onCopy,
}: {
  readonly address: string;
  readonly onCopy: (address: string) => Promise<void>;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    onCopy(address).then(
      () => {
        setCopied(true);
        toast.show({
          id: 'bookings-address-copied',
          title: t({
            id: 'bookings.add.copiedToast',
            message: 'Forward any confirmation to that address.',
          }),
        });
      },
      () => undefined,
    );
  };
  return (
    <Row gap="8" align="center" style={styles.pill} testID="bookings-address">
      <Text variant="monoData" style={styles.address} numberOfLines={1} selectable>
        {address}
      </Text>
      <PillButton
        label={
          copied
            ? t({ id: 'bookings.add.copied', message: 'Copied' })
            : t({ id: 'bookings.add.copy', message: 'Copy' })
        }
        onPress={copy}
        tone="cream"
        size="sm"
        flap
        testID="bookings-address-copy"
      />
    </Row>
  );
}
