import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { makeStyles, useTheme } from '../theme';
import { useSurfaceBackground } from './Scaffold';

/**
 * Height of the fade above a sticky footer: scroll content passing under it fades into the page
 * instead of being cut off at the footer's edge, so a partly hidden card reads as "more below". A
 * scroll body above the footer should end this much further down, so its last item scrolls clear.
 */
export const FOOTER_FADE_PT = tokens.space['24'];

/** A top-to-bottom gradient from clear into `color` (a `#rrggbb` token colour). */
function fadeInto(color: string): string {
  const clear = /^#[0-9a-f]{6}$/iu.test(color) ? `${color}00` : 'transparent';
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never shown to a user
  return `linear-gradient(to bottom, ${clear}, ${color})`;
}

const useStyles = makeStyles(() => ({
  fade: {
    position: 'absolute',
    bottom: '100%',
    start: 0,
    end: 0,
    height: FOOTER_FADE_PT,
  },
}));

export interface FooterFadeProps {
  /** The page colour to fade into; defaults to the nearest `Scaffold`'s background. */
  readonly color?: string | undefined;
  readonly testID?: string | undefined;
}

/**
 * Drop in as the first child of any sticky footer (which must not clip its overflow): it draws
 * above the footer's top edge, takes no space and ignores touches.
 */
export function FooterFade({ color, testID }: FooterFadeProps) {
  const styles = useStyles();
  const theme = useTheme();
  const surface = useSurfaceBackground();
  const background = color ?? surface ?? theme.semantic.bg.base;
  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[styles.fade, { backgroundImage: fadeInto(background) }]}
    />
  );
}
