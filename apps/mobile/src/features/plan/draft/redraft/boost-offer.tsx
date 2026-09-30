/**
 * No free redrafts left: says so, offers the trip boost (unlimited redrafts) when the paywall is
 * registered, and reminds that redrafts reset every trip.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  box: { gap: th.space['8'], alignItems: 'center' },
  centred: { textAlign: 'center' },
}));

export function BoostOffer({ onBoost }: { readonly onBoost: (() => void) | undefined }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.box} testID="redraft-spent">
      <Text variant="body" style={styles.centred}>
        {t({ id: 'planDraft.spent.line', message: 'That’s every free redraft on this trip.' })}
      </Text>
      {onBoost === undefined ? null : (
        <PillButton
          variant="secondary"
          tone="pink"
          label={t({ id: 'planDraft.spent.boost', message: 'Boost for unlimited redrafts' })}
          onPress={onBoost}
          testID="redraft-boost"
        />
      )}
      <Text variant="caption" color={theme.semantic.text.tertiary} style={styles.centred}>
        {t({ id: 'planDraft.spent.reset', message: 'Redrafts reset every trip.' })}
      </Text>
    </View>
  );
}
