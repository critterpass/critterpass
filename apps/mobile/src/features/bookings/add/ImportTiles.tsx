/**
 * The three ways in (3h-2): FORWARD any email, SCAN paper or a screen, PASTE a link or code, and
 * the crew's forward address with COPY (the label flips to COPIED, and a toast says what to do
 * with it). The address reads at body size on two lines, the crew's part and "@domain"; COPY sits
 * beside it when both fit and under it when they do not, and tapping the address copies too. The empty wallet shows the same tiles inline.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { tokens } from '@cp/design-tokens';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { TileGrid } from '@/ui/cards/TileGrid';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { ADDRESS_SIZE, addressLines, copyFitsBeside } from './address-lines';

export type ImportChannel = 'forward' | 'scan' | 'paste';

const COPIED_MS = 2000;

const ADDRESS_LINE = 1.4;
const PILL_PADDING_START = tokens.space['16'];
const PILL_PADDING_END = tokens.space['10'];

const useStyles = makeStyles((t) => ({
  pill: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
    borderRadius: t.radius.lg,
    paddingStart: PILL_PADDING_START,
    paddingEnd: PILL_PADDING_END,
    paddingVertical: t.space['10'],
    gap: t.space['8'],
  },
  beside: { flexDirection: 'row', alignItems: 'center' },
  stacked: { flexDirection: 'column', alignItems: 'flex-start' },
  address: { flex: 1 },
  mono: { fontSize: ADDRESS_SIZE, lineHeight: ADDRESS_SIZE * ADDRESS_LINE },
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
  const [innerWidth, setInnerWidth] = useState<number | null>(null);
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
  const [local, domain] = addressLines(address);
  // Until the pill is measured the button sits under the address, which fits any width.
  const beside = innerWidth !== null && copyFitsBeside(address, innerWidth);
  const button = (
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
  );
  return (
    <View
      style={[styles.pill, beside ? styles.beside : styles.stacked]}
      onLayout={(event) =>
        setInnerWidth(event.nativeEvent.layout.width - PILL_PADDING_START - PILL_PADDING_END)
      }
      testID="bookings-address"
    >
      {/* The address at reading size, broken only at the "@"; a local part too long for the line
          wraps rather than shrinks. Tapping it copies, like the button. */}
      <PressScale
        onPress={copy}
        accessibilityLabel={t({
          id: 'bookings.add.copyAddressA11y',
          message: `${address}, copy the address`,
        })}
        style={beside ? styles.address : undefined}
        testID="bookings-address-text"
      >
        <Text variant="monoData" autoFit={false} style={styles.mono}>
          {local}
        </Text>
        {domain === '' ? null : (
          <Text variant="monoData" autoFit={false} style={styles.mono}>
            {domain}
          </Text>
        )}
      </PressScale>
      {button}
    </View>
  );
}
