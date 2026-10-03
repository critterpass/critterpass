/**
 * The guide's note on a planning screen, in the guide's voice and colour with one way to act on it
 * (7a-1 "Three things to fix before Oct 12." CHECK, 7b-1 "Rain at 1…" SEE). As a card it adds a
 * plain line under the voice (7a-3 "Checked against opening hours, drives, bookings…").
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PillButton } from '../buttons/PillButton';
import { GuideLine, type GuideId } from '../people/GuideLine';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface TokekNoteProps {
  readonly guide: GuideId;
  /** The guide's display name, read before the line. */
  readonly name: string;
  readonly line: string;
  readonly sticker?: ReactNode | undefined;
  /** A plain line under the voice; drawn as a card (7a-3, 7b-3). */
  readonly detail?: string | undefined;
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  card: {
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
  body: { flex: 1, minWidth: 0, gap: t.space['4'] },
}));

export function TokekNote({ guide, name, line, sticker, detail, action, testID }: TokekNoteProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.row, detail === undefined ? null : styles.card]} testID={testID}>
      {sticker}
      <View style={styles.body}>
        <GuideLine guide={guide} name={name} line={line} />
        {detail === undefined ? null : (
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {detail}
          </Text>
        )}
      </View>
      {action === undefined ? null : (
        <PillButton size="sm" label={action.label} onPress={action.onPress} />
      )}
    </View>
  );
}
