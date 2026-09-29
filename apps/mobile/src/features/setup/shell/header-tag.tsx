/**
 * The tag at the top end of the setup header: on the dates step, the destination vote's result as
 * a small tilted orange sticker ("KYOTO WON 4–2"); on later steps, what the step before settled, in
 * green with a check ("APR 2–9 ✓", "BUDGET ✓").
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

const TILT = -4;

const useStyles = makeStyles((th) => ({
  sticker: {
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['6'],
    borderRadius: th.radius.sm,
    transform: [{ rotate: degrees(TILT) }],
  },
}));

export function WonTag({
  destination,
  won,
  next,
}: {
  readonly destination: string;
  readonly won: number;
  readonly next: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const label = t({ id: 'setup.tag.won', message: `${destination} won ${won}–${next}` });
  return (
    <View
      style={[styles.sticker, { backgroundColor: theme.color.orange }]}
      accessible
      accessibilityLabel={label}
      testID="setup-tag-won"
    >
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {label}
      </Text>
    </View>
  );
}

/** What the previous step settled, with a check ("Apr 2–9", "Budget"). */
export function DoneTag({ label }: { readonly label: string }) {
  const theme = useTheme();
  const spoken = t({ id: 'setup.tag.doneA11y', message: `${label}, done` });
  return (
    <View accessible accessibilityLabel={spoken} testID="setup-tag-done">
      <Text variant="label" color={theme.semantic.state.success}>
        {`${label} ✓`}
      </Text>
    </View>
  );
}
