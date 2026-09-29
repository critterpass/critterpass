/**
 * Small notes over the map: offline ("Offline · last update 14:05"), the Always upgrade ("Keep
 * sharing when your phone is locked", offered only here), While-In-Use in the background
 * ("Updates when you open the app"), Low Power Mode ("Saving battery") and precise location off
 * ("Approximate").
 */
import { t } from '@lingui/core/macro';

import { InfoPill } from '@/ui/chips/InfoPill';
import { PressScale } from '@/ui/press/PressScale';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  banner: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.md,
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['10'],
    borderWidth: 1,
    borderColor: th.color.divider,
  },
  chips: { gap: th.space['6'], flexWrap: 'wrap' },
}));

export function OfflineNote({ lastUpdate }: { readonly lastUpdate: string | null }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.banner} testID="live-offline">
      <Text variant="bodySm" color={theme.semantic.text.primary}>
        {lastUpdate === null
          ? t({ id: 'liveMap.offline.none', message: 'Offline · waiting for the crew' })
          : t({ id: 'liveMap.offline.last', message: `Offline · last update ${lastUpdate}` })}
      </Text>
    </Stack>
  );
}

export function AlwaysUpgradeBanner({ onPress }: { readonly onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t({
        id: 'liveMap.always.banner',
        message: 'Keep sharing when your phone is locked',
      })}
      style={styles.banner}
      testID="live-always-upgrade"
    >
      <Text variant="bodySm" color={theme.semantic.text.primary}>
        {t({ id: 'liveMap.always.banner', message: 'Keep sharing when your phone is locked' })}
      </Text>
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {t({ id: 'liveMap.always.now', message: 'Updates when you open the app' })}
      </Text>
    </PressScale>
  );
}

export function SelfChips({
  approximate,
  savingBattery,
}: {
  readonly approximate: boolean;
  readonly savingBattery: boolean;
}) {
  const styles = useStyles();
  if (!approximate && !savingBattery) return null;
  return (
    <Row style={styles.chips}>
      {approximate ? (
        <InfoPill testID="live-approximate">
          {t({ id: 'liveMap.chip.approximate', message: 'Approximate' })}
        </InfoPill>
      ) : null}
      {savingBattery ? (
        <InfoPill testID="live-saving-battery">
          {t({ id: 'liveMap.chip.savingBattery', message: 'Saving battery' })}
        </InfoPill>
      ) : null}
    </Row>
  );
}
