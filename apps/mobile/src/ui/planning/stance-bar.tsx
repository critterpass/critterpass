/**
 * Where the crew stands on a place (7e-3): WANT IT on the left in pink with its faces, RATHER NOT
 * on the right in blue with theirs, a bar split by the count, and who hasn't said under it.
 * Stances are public ballots: only people who said so appear.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { AvatarStack, type StackMember } from '../people/AvatarStack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface StanceBarProps {
  readonly want: readonly StackMember[];
  readonly ratherNot: readonly StackMember[];
  /** "Rin and you haven't said". */
  readonly caption?: string | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  card: {
    gap: t.space['10'],
    padding: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
  heads: { flexDirection: 'row', justifyContent: 'space-between' },
  middle: { flexDirection: 'row', alignItems: 'center', gap: t.space['10'] },
  bar: { flex: 1, flexDirection: 'row', height: 8, gap: t.space['4'] },
  side: { borderRadius: 4 },
}));

export function StanceBar({ want, ratherNot, caption, testID }: StanceBarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const wantColor = theme.semantic.state.urgent;
  const notColor = theme.semantic.state.info;
  const total = want.length + ratherNot.length;
  const summary = t({
    id: 'kit.stanceBar.summary',
    message: `${String(want.length)} want it, ${String(ratherNot.length)} would rather not`,
  });
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={caption === undefined ? summary : `${summary}. ${caption}`}
      testID={testID}
    >
      <View style={styles.heads}>
        <Text variant="label" color={wantColor}>
          {t({ id: 'kit.stanceBar.want', message: 'Want it' })}
        </Text>
        <Text variant="label" color={notColor}>
          {t({ id: 'kit.stanceBar.ratherNot', message: 'Rather not' })}
        </Text>
      </View>
      <View style={styles.middle}>
        <AvatarStack members={want} size="sm" max={4} />
        <View style={styles.bar}>
          {want.length > 0 ? (
            <View style={[styles.side, { flex: want.length, backgroundColor: wantColor }]} />
          ) : null}
          {ratherNot.length > 0 ? (
            <View style={[styles.side, { flex: ratherNot.length, backgroundColor: notColor }]} />
          ) : null}
          {total === 0 ? (
            <View style={[styles.side, { flex: 1, backgroundColor: theme.color.ink[600] }]} />
          ) : null}
        </View>
        <AvatarStack members={ratherNot} size="sm" max={4} />
      </View>
      {caption === undefined ? null : (
        <Text
          variant="bodySm"
          color={theme.semantic.text.secondary}
          style={{ textAlign: 'center' }}
        >
          {caption}
        </Text>
      )}
    </View>
  );
}
