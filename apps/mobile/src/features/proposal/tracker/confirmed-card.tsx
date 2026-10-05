/**
 * The tracker once the crew is locked in: the guide, "The trip is on", who is going and when, and
 * the way into the plan everyone now shares.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.state.success,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['12'],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  grow: { flex: 1, gap: th.space['2'] },
}));

export interface ConfirmedCardProps {
  readonly guide: GuideStickerId;
  readonly going: number;
  /** "Lisbon · Nov 5–11". */
  readonly tripLine: string;
  /** Opens the plan; absent until the plan area offers it. */
  readonly onPlan: (() => void) | undefined;
}

export function ConfirmedCard(props: ConfirmedCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(props.guide);
  const ink = theme.semantic.text.onAccent;
  const going = props.going;
  return (
    <View style={styles.card} testID="tracker-confirmed">
      <View style={styles.top}>
        <Sticker kind={info.kind} name={info.name} size={72} />
        <View style={styles.grow}>
          <Text variant="h2" color={ink}>
            {t({ id: 'proposal.confirmed.title', message: 'The trip is on' })}
          </Text>
          <Text variant="bodySm" color={ink}>
            {props.tripLine}
          </Text>
          <Text variant="bodySm" color={ink}>
            {t({ id: 'proposal.confirmed.going', message: `${going} going` })}
          </Text>
        </View>
      </View>
      {props.onPlan === undefined ? null : (
        <PillButton
          tone="ink"
          size="sm"
          label={t({ id: 'proposal.confirmed.plan', message: 'Open the plan' })}
          onPress={props.onPlan}
          testID="tracker-open-plan"
        />
      )}
    </View>
  );
}
