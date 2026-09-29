/**
 * The own row's PAUSE / RESUME chip (undesigned control, built from the chip styles): pausing stops
 * publishing at once and takes the pin off everyone's map.
 */
import { t } from '@lingui/core/macro';

import { PressScale } from '@/ui/press/PressScale';
import { Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { CAPSULE_RADIUS } from '../map/capsule';

const useStyles = makeStyles((th) => ({
  chip: {
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['6'],
    minHeight: 32,
    justifyContent: 'center',
  },
}));

export function PauseChip({
  paused,
  onPress,
}: {
  readonly paused: boolean;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const label = paused
    ? t({ id: 'liveMap.pause.resume', message: 'Resume' })
    : t({ id: 'liveMap.pause.pause', message: 'Pause' });
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        paused
          ? t({ id: 'liveMap.pause.resumeLabel', message: 'Resume sharing your location' })
          : t({ id: 'liveMap.pause.pauseLabel', message: 'Pause sharing your location' })
      }
      style={[
        styles.chip,
        { borderColor: paused ? theme.semantic.text.primary : theme.semantic.text.secondary },
      ]}
      testID="live-pause-chip"
    >
      <Text variant="buttonSm" style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
    </PressScale>
  );
}
