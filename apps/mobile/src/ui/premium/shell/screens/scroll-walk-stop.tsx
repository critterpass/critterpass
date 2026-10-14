/**
 * An empty native view that ends react-native-screens' first-subview walks (iOS). The library
 * walks down `subviews[0]` from a screen to the first scroll view it meets, and changes it:
 *
 * - on a form sheet it sets that scroll view's frame to the sheet screen's own frame, origin
 *   included, so a scroll view nested under the content's root (the paywall's night ground, the
 *   mailbox's sheet material) landed where the screen sat while the sheet was still rising, below
 *   its bottom edge, and the sheet opened blank;
 * - under the native tabs it turns a scroll view's `contentInsetAdjustmentBehavior` of `never`
 *   back to `automatic`, so a root page that lays out its own title under the status bar got the
 *   system's inset as well and its title sat a row below its actions.
 *
 * Put first in the content, it ends both walks; each scroll view keeps its own layout and insets.
 */
import { StyleSheet, View } from 'react-native';

export function ScrollWalkStop() {
  return (
    <View collapsable={false} pointerEvents="none" style={styles.stop} testID="scroll-walk-stop" />
  );
}

const styles = StyleSheet.create({
  stop: { position: 'absolute', top: 0, left: 0, width: 0, height: 0 },
});
