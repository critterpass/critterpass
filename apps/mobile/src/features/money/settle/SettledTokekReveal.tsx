/**
 * The Settled Tokek: while payments are open, its locked silhouette with a "?" and how many are
 * left ("Two more payments and all six of you get the Settled Tokek."); once the trip is square,
 * the sticker itself. The ceremony (confetti and the toast) is played by the settle screen when
 * the grant arrives.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';
import { guideSticker } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const SIZE = 72;

const useStyles = makeStyles((t) => ({
  art: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  mark: { position: 'absolute' },
  line: { flex: 1 },
  row: { gap: t.space['12'], alignItems: 'center' },
}));

export function SettledTokekReveal({
  open,
  people,
  settled,
}: {
  /** Payments still open. */
  readonly open: number;
  /** Everyone who gets it. */
  readonly people: number;
  readonly settled: boolean;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const bob = useLoop('bob', { active: settled });
  const tokek = guideSticker('tokek');
  const line = settled
    ? t({ id: 'money.settle.settledLine', message: 'All square. Everyone gets the Settled Tokek.' })
    : t({
        id: 'money.settle.progress',
        message: plural(open, {
          one: `One more payment and all ${people} of you get the Settled Tokek.`,
          other: `# more payments and all ${people} of you get the Settled Tokek.`,
        }),
      });
  return (
    <Row style={styles.row} testID={settled ? 'money-settled-tokek' : 'money-settled-progress'}>
      <Animated.View style={[styles.art, settled ? bob : null]}>
        {settled ? (
          <Sticker kind={tokek.kind} name={tokek.name} size={SIZE} pose="cheer" />
        ) : (
          <View style={styles.art}>
            <Sticker
              kind={tokek.kind}
              name={tokek.name}
              size={SIZE}
              variant="mask"
              maskColor={theme.tier.locked.default}
              sticker={null}
            />
            <Text variant="h2" style={styles.mark} color={theme.semantic.text.secondary}>
              ?
            </Text>
          </View>
        )}
      </Animated.View>
      <Text variant="voice" color={theme.semantic.action.primary} style={styles.line}>
        {line}
      </Text>
    </Row>
  );
}
