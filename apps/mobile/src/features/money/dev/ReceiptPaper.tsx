/**
 * A drawn paper receipt for the money lab's scan scenes (the design draws the camera view the same
 * way): its rows sit at fixed fractions of the paper, so the scan highlights line up with them.
 * `folded` greys the middle rows out under a crease, as a crumpled receipt reads.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture receipt text, only in the (dev) lab. */
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface PaperRow {
  readonly id: string;
  readonly left: string;
  readonly right: string;
  /** [x, y, w, h] of the row on the paper, 0 to 1. */
  readonly box: readonly [number, number, number, number];
  readonly kind: 'head' | 'line' | 'total';
}

export const IBU_OKA_ROWS: readonly PaperRow[] = [
  { id: 'l0', left: 'IBU OKA · UBUD', right: '', box: [0.06, 0.06, 0.88, 0.1], kind: 'head' },
  {
    id: 'l1',
    left: '14/10 · 13:12 · meja 4',
    right: '',
    box: [0.06, 0.17, 0.88, 0.07],
    kind: 'head',
  },
  {
    id: 'l3',
    left: 'Babi guling x5',
    right: '850.000',
    box: [0.06, 0.32, 0.88, 0.1],
    kind: 'line',
  },
  { id: 'l4', left: 'Es kelapa x6', right: '130.000', box: [0.06, 0.44, 0.88, 0.1], kind: 'line' },
  { id: 'l5', left: 'Service 10%', right: '100.000', box: [0.06, 0.56, 0.88, 0.1], kind: 'line' },
  { id: 'l6', left: 'TOTAL', right: '1.080.000', box: [0.06, 0.76, 0.88, 0.1], kind: 'total' },
];

const useStyles = makeStyles((t) => ({
  paper: {
    width: '100%',
    aspectRatio: 1.25,
    backgroundColor: t.color.paper.base,
    borderRadius: t.radius.xs,
  },
  row: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
}));

export function ReceiptPaper({
  rows = IBU_OKA_ROWS,
  folded = false,
}: {
  readonly rows?: readonly PaperRow[];
  readonly folded?: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.color.ink['950'];
  return (
    <View style={styles.paper} accessibilityLabel="Receipt">
      {rows.map((row) => {
        const hidden = folded && row.kind === 'line';
        return (
          <View
            key={row.id}
            style={[
              styles.row,
              {
                left: `${row.box[0] * 100}%`,
                top: `${row.box[1] * 100}%`,
                width: `${row.box[2] * 100}%`,
                height: `${row.box[3] * 100}%`,
                justifyContent: row.kind === 'head' ? 'center' : 'space-between',
                opacity: hidden ? 0.25 : 1,
              },
            ]}
          >
            <Text
              variant={row.kind === 'head' && row.id === 'l0' ? 'title' : 'monoData'}
              color={ink}
            >
              {row.left}
            </Text>
            {row.right === '' ? null : (
              <Text variant="monoData" color={ink}>
                {row.right}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
