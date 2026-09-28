import type { ReactNode } from 'react';
import { View } from 'react-native';

import { DocField } from '../documents/DocField';
import { PaperChrome } from '../documents/PaperChrome';
import { paperColours } from '../documents/paper-colours';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { MrzLines } from './MrzLines';

export interface PassCardField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  /** Not filled in yet ("Not yet", "We'll ask"): printed in the faded label ink. */
  readonly pending?: boolean;
}

export interface PassCardProps {
  /** Running head, "CRITTERPASS · PASSEPORT". */
  readonly head: string;
  /** "CP-0427", or the placeholder while the number is still syncing. */
  readonly number: string;
  /** Micro-label under the number while it waits for the server ("SYNCING"). */
  readonly numberNote?: string;
  /** Photo window content; `null` draws the dashed "?" frame. */
  readonly photo: ReactNode | null;
  readonly nameLabel: string;
  /** The name as printed; a node so 3a-2 can drop glyphs onto it as they are typed. */
  readonly name: ReactNode;
  /** Home and issued share a row; travel style spans the width. */
  readonly home: PassCardField;
  readonly issued: PassCardField;
  readonly style: PassCardField;
  readonly mrz: readonly string[];
  /** Stamps laid over the lower page (ISSUED, HOME). */
  readonly stamps?: ReactNode;
  /** Corner badge once the pass is saved to an account (the SAVED tick). */
  readonly corner?: ReactNode;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const PHOTO_W = 88;
const PHOTO_H = 108;

const useStyles = makeStyles((t) => ({
  photo: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: t.radius.sm,
    backgroundColor: t.semantic.bg.base,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  stamps: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: { position: 'absolute', top: -10, end: -10 },
  number: { alignItems: 'flex-end' },
  mrz: { borderTopWidth: 1, borderStyle: 'dashed', paddingTop: t.space['8'] },
}));

function Field({ field, flex }: { readonly field: PassCardField; readonly flex?: number }) {
  const theme = useTheme();
  if (!field.pending) {
    return <DocField label={field.label} value={field.value} {...(flex ? { flex } : {})} />;
  }
  const faded = paperColours(theme).label;
  return (
    <Stack gap="2" {...(flex ? { flex } : {})}>
      <Text variant="monoData" color={faded}>
        {field.label}
      </Text>
      <Text variant="title" color={faded} numberOfLines={1}>
        {field.value}
      </Text>
    </Stack>
  );
}

/**
 * The holder's pass page (3a-2 → 3a-7): photo window, given name, home, issued date, travel style,
 * the MRZ foot and any stamps. Built on the shared passport paper; read as one element.
 */
export function PassCard({
  head,
  number,
  numberNote,
  photo,
  nameLabel,
  name,
  home,
  issued,
  style,
  mrz,
  stamps,
  corner,
  accessibilityLabel,
  testID,
}: PassCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const faded = paperColours(theme).label;
  return (
    <View testID={testID}>
      <PaperChrome accessibilityLabel={accessibilityLabel}>
        <Row justify="space-between" gap="8">
          <Text variant="monoData">{head}</Text>
          <View style={styles.number}>
            <Text variant="monoData" testID={testID ? `${testID}-number` : undefined}>
              {number}
            </Text>
            {numberNote ? (
              <Text variant="monoData" color={faded}>
                {numberNote}
              </Text>
            ) : null}
          </View>
        </Row>
        <Row gap="14">
          <View
            style={[
              styles.photo,
              photo === null ? [styles.photoEmpty, { borderColor: faded }] : null,
            ]}
          >
            {photo ?? (
              <Text variant="h2" color={faded}>
                ?
              </Text>
            )}
          </View>
          <Stack gap="8" flex={1}>
            <Stack gap="2">
              <Text variant="monoData" color={faded}>
                {nameLabel}
              </Text>
              {name}
            </Stack>
            <Row gap="10">
              <Field field={home} flex={1} />
              <Field field={issued} flex={1} />
            </Row>
            <Field field={style} />
          </Stack>
        </Row>
        <View style={{ height: stamps ? 72 : 8 }} />
        <View style={[styles.mrz, { borderColor: paperColours(theme).border }]}>
          <MrzLines lines={mrz} {...(testID ? { testID: `${testID}-mrz` } : {})} />
        </View>
      </PaperChrome>
      {stamps ? (
        <View pointerEvents="none" style={styles.stamps}>
          {stamps}
        </View>
      ) : null}
      {corner ? <View style={styles.corner}>{corner}</View> : null}
    </View>
  );
}
