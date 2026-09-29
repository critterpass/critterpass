import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { StraightArrow } from '../icons/StraightArrow';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

/** True when there is a screen to go back to; false outside a navigator (tests, the gallery). */
export function canGoBack(): boolean {
  try {
    return router.canGoBack();
  } catch {
    return false;
  }
}

const useStyles = makeStyles(() => ({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface BackButtonProps {
  /** Defaults to going back one screen. */
  readonly onPress?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

/** The icon-only back control of a pushed screen's header: a straight arrow on a 44 pt target. */
export function BackButton({ onPress, testID = 'header-back' }: BackButtonProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'common.shell.back', message: 'Back' })}
      onPress={onPress ?? (() => router.back())}
      style={styles.button}
    >
      <StraightArrow direction="back" color={theme.semantic.text.primary} />
    </Pressable>
  );
}
