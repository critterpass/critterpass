/**
 * An empty native view that ends react-native-screens' first-subview walk on an iOS form sheet. The
 * library walks down `subviews[0]` from the sheet's screen to the first scroll view it meets and,
 * whenever the screen lays out, sets that scroll view's frame to the sheet screen's own frame,
 * origin included. A scroll view nested under the content's root (the paywall's night ground, the
 * mailbox's sheet material, a group's whole stack) was moved to where the screen sat while the
 * sheet was still rising, below its bottom edge, and the sheet opened blank. Put first in the
 * sheet's content, it ends the walk; the scroll view keeps the frame its own layout gives it.
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
