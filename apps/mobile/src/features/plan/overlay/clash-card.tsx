/**
 * A personal change that clashes with the crew plan (the crew removed or moved the item under
 * it): keep mine, or go with the crew's. It leads the stop's sheet.
 */
import type { OverlayClash } from '@cp/planner';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    borderLeftWidth: 4,
    borderLeftColor: th.semantic.state.urgent,
    padding: th.space['14'],
    gap: th.space['8'],
  },
  actions: { gap: th.space['8'] },
}));

export function ClashCard({
  clash,
  label,
  onKeep,
  onDrop,
}: {
  readonly clash: OverlayClash;
  /** The stop's name. */
  readonly label: string;
  readonly onKeep: () => void;
  readonly onDrop: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.card} testID={`plan-clash-${clash.stableId}`}>
      <Text variant="title">
        {t({ id: 'plan.overlay.clash.title', message: `${label} clashes with the crew plan` })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {clash.kind === 'removed_by_crew'
          ? t({
              id: 'plan.overlay.clash.removed',
              message: 'The crew took it out of their plan. Keep it just for you, or let it go?',
            })
          : t({
              id: 'plan.overlay.clash.changed',
              message:
                'The crew moved it since you changed it for yourself. Keep yours, or go with theirs?',
            })}
      </Text>
      <View style={styles.actions}>
        <PillButton
          size="sm"
          block
          label={t({ id: 'plan.overlay.clash.keep', message: 'Keep mine' })}
          onPress={onKeep}
          testID={`plan-clash-keep-${clash.stableId}`}
        />
        <PillButton
          size="sm"
          variant="secondary"
          block
          label={t({ id: 'plan.overlay.clash.drop', message: 'Go with the crew' })}
          onPress={onDrop}
          testID={`plan-clash-drop-${clash.stableId}`}
        />
      </View>
    </View>
  );
}
