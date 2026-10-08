import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { Pressable } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';

import { StraightArrow } from '../icons/StraightArrow';
import { useBackAffordance } from '../qa/back-affordance';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export { canGoBack } from '@/lib/navigation/back';

const useStyles = makeStyles(() => ({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface BackButtonProps {
  /** Defaults to going back one screen, or to `fallback` when nothing is under this one. */
  readonly onPress?: (() => void) | undefined;
  /** Where back lands when this screen was opened cold (a link, a push tap). @default Home */
  readonly fallback?: Href | undefined;
  readonly testID?: string | undefined;
}

/**
 * The icon-only back control of a pushed screen's header: a straight arrow on a 44 pt target. It
 * counts as its screen's way back for the no-back-affordance check.
 */
export function BackButton({ onPress, fallback, testID = 'header-back' }: BackButtonProps) {
  useBackAffordance();
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'common.shell.back', message: 'Back' })}
      onPress={onPress ?? (() => goBackOr(fallback))}
      style={styles.button}
    >
      <StraightArrow direction="back" color={theme.semantic.text.primary} />
    </Pressable>
  );
}
