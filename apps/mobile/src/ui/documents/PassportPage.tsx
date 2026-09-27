import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { makeStyles } from '../theme';
import { DocField } from './DocField';
import { PaperChrome } from './PaperChrome';

export interface PassportField {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface PassportPageProps {
  readonly headStart: string;
  readonly headEnd?: string;
  /** Holder photo or guide sticker in the photo window. */
  readonly photo: ReactNode;
  /** Printed fields, two per row after the first (name spans the width). */
  readonly fields: readonly PassportField[];
  /** Stamps (`Stamp`) laid over the lower page. */
  readonly stamps?: ReactNode;
  readonly mrz?: readonly string[];
  /** The page read as one element ("Passport of Winston, home Singapore, …"). */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  photo: {
    width: 88,
    height: 108,
    borderRadius: t.radius.sm,
    backgroundColor: t.semantic.bg.base,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamps: { minHeight: 96, alignItems: 'center', justifyContent: 'center' },
}));

function pairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/** The data page (3a-6): guilloche paper, photo window, bilingual fields, stamps and MRZ. */
export function PassportPage({
  headStart,
  headEnd,
  photo,
  fields,
  stamps,
  mrz,
  accessibilityLabel,
  testID,
}: PassportPageProps) {
  const styles = useStyles();
  const [first, ...rest] = fields;
  return (
    <PaperChrome
      headStart={headStart}
      {...(headEnd ? { headEnd } : {})}
      {...(mrz ? { mrz } : {})}
      accessibilityLabel={accessibilityLabel}
      {...(testID ? { testID } : {})}
    >
      <Row gap="14">
        <View style={styles.photo}>{photo}</View>
        <Stack gap="8" flex={1}>
          {first ? <DocField label={first.label} value={first.value} /> : null}
          {pairs(rest).map((row) => (
            <Row key={row.map((field) => field.key).join('|')} gap="10">
              {row.map((field) => (
                <DocField key={field.key} label={field.label} value={field.value} flex={1} />
              ))}
            </Row>
          ))}
        </Stack>
      </Row>
      {stamps ? <View style={styles.stamps}>{stamps}</View> : null}
    </PaperChrome>
  );
}
