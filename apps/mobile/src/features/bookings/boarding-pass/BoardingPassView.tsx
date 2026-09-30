/**
 * The boarding pass full screen (undesigned; the paper surface and ticket type scale): the flight
 * or booking title, the code as a large QR on paper (dark modules on the paper colour in any
 * theme, for the gate reader), the seat and gate, and a close button. With no pass on the phone
 * it says to scan it at check-in. Reads from the local copy, so it opens in airplane mode.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { DocField } from '@/ui/documents/DocField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { CloseButton } from '@/ui/sheet/CloseButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { qrPath } from './qr-path';

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['16'],
    gap: t.space['24'],
  },
  close: { alignSelf: 'flex-end' },
  code: {
    alignSelf: 'center',
    backgroundColor: t.color.paper.base,
    borderRadius: t.radius.md,
    padding: t.space['12'],
  },
  cell: { flex: 1, minWidth: 0 },
  missing: { textAlign: 'center' },
}));

export interface BoardingPassViewProps {
  /** "SQ 938 · SIN → DPS", or the booking's title. */
  readonly title: string;
  readonly subtitle: string;
  readonly payload: string | null;
  readonly fields: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
  }[];
  readonly onClose: () => void;
}

export function BoardingPassView(props: BoardingPassViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { width } = useWindowDimensions();
  const size = Math.min(width - theme.size.gutter * 2 - theme.space['24'], 360);
  const tokek = GUIDE_STICKERS.tokek;
  const qr = useMemo(
    () => (props.payload === null ? null : qrPath(props.payload)),
    [props.payload],
  );
  return (
    <Scaffold variant="paper" testID="bookings-pass">
      <View style={styles.root}>
        <View style={styles.close}>
          <CloseButton onPress={props.onClose} onPaper testID="bookings-pass-close" />
        </View>
        <Stack gap="4">
          <Text variant="h1" accessibilityRole="header">
            {upper(props.title, locale)}
          </Text>
          <Text variant="body">{props.subtitle}</Text>
        </Stack>
        {qr === null ? (
          <Stack gap="16" align="center" testID="bookings-pass-missing">
            <Sticker kind={tokek.kind} name={tokek.name} size={120} pose="think" />
            <Text variant="bodyLg" style={styles.missing}>
              {t({
                id: 'bookings.pass.missing',
                message:
                  'No boarding pass on this phone yet. Scan it at check-in and it lands here.',
              })}
            </Text>
          </Stack>
        ) : (
          <View
            style={styles.code}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t({
              id: 'bookings.pass.codeA11y',
              message: `Boarding pass code for ${props.title}, hold it to the gate reader`,
            })}
            testID="bookings-pass-code"
          >
            <Canvas style={{ width: size, height: size }}>
              <Group transform={[{ scale: size / qr.size }]}>
                <Path path={qr.path} color={theme.color.paper.ink} />
              </Group>
            </Canvas>
          </View>
        )}
        {props.fields.length === 0 ? null : (
          <Row gap="12">
            {props.fields.map((field) => (
              <View key={field.key} style={styles.cell}>
                <DocField label={upper(field.label, locale)} value={field.value} />
              </View>
            ))}
          </Row>
        )}
      </View>
    </Scaffold>
  );
}
