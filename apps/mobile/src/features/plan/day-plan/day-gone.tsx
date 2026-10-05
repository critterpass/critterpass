/**
 * A day that is not in the plan (undesigned): the link named a day the plan no longer has, or the
 * trip got shorter while the screen was open. Says so, with the way back, instead of a blank page.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, gap: t.space['16'] },
  start: { alignItems: 'flex-start' },
}));

export function DayGone({ onBack }: { readonly onBack: () => void }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Scaffold variant="dark" testID="day-gone">
      <View style={styles.body}>
        <View style={styles.start}>
          <BackEyebrow
            label={t({ id: 'plan.dayPlan.back', message: 'Trip' })}
            onPress={onBack}
            testID="day-gone-back"
          />
        </View>
        <Text variant="h1">
          {t({ id: 'plan.dayPlan.gone', message: 'This day isn’t in the plan any more' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'plan.dayPlan.goneBody',
            message: 'The trip’s days changed. Its other days are on the trip.',
          })}
        </Text>
        <PillButton
          label={t({ id: 'plan.dayPlan.goneBack', message: 'Back to the trip' })}
          onPress={onBack}
          testID="day-gone-to-trip"
        />
      </View>
    </Scaffold>
  );
}
