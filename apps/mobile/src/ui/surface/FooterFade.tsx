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

/** Bands the fade is drawn with: 12 steps of 2 pt read as a smooth ramp at phone densities. */
const BANDS = 12;
const BAND_PT = FOOTER_FADE_PT / BANDS;

const useStyles = makeStyles(() => ({
  // In flow, pulled up over the end of whatever sits above it: a view drawn outside its parent's
  // bounds can be clipped on Android, so the fade overlaps its sibling instead.
  fade: { height: FOOTER_FADE_PT, marginTop: -FOOTER_FADE_PT, alignSelf: 'stretch' },
  band: { height: BAND_PT },
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
  // Solid bands of rising opacity rather than a native gradient, so the ramp draws the same on every
  // platform and version.
  return (
    <View pointerEvents="none" testID={testID} style={styles.fade}>
      {Array.from({ length: BANDS }, (_, index) => (
        <View
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a React key
          key={`band-${String(index)}`}
          style={[styles.band, { backgroundColor: background, opacity: (index + 1) / BANDS }]}
        />
      ))}
    </View>
  );
}
