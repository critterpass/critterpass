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

/**
 * The page colour with no opacity. A gradient from plain `transparent` (transparent black) would
 * pass through grey on the way, so the fade starts from the page colour itself at zero alpha.
 */
function clear(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}00` : 'transparent';
}

const useStyles = makeStyles(() => ({
  // In flow, pulled up over the end of whatever sits above it: a view drawn outside its parent's
  // bounds can be clipped on Android, so the fade overlaps its sibling instead.
  fade: { height: FOOTER_FADE_PT, marginTop: -FOOTER_FADE_PT, alignSelf: 'stretch' },
}));

export interface FooterFadeProps {
  /** The page colour to fade into; defaults to the nearest `Scaffold`'s background. */
  readonly color?: string | undefined;
  readonly testID?: string | undefined;
}

/**
 * Place it directly before a sticky footer, as its sibling: it overlaps the last FOOTER_FADE_PT of
 * the content above (so it takes no space) and ignores touches, which pass through to the content.
 */
export function FooterFade({ color, testID }: FooterFadeProps) {
  const styles = useStyles();
  const theme = useTheme();
  const surface = useSurfaceBackground();
  const background = color ?? surface ?? theme.semantic.bg.base;
  // One native gradient: stacked bands of rising opacity showed as stripes on device.
  return (
    <View
      pointerEvents="none"
      testID={testID}
      style={[
        styles.fade,
        {
          backgroundImage: [
            {
              type: 'linear-gradient',
              colorStops: [{ color: clear(background) }, { color: background }],
            },
          ],
        },
      ]}
    />
  );
}
