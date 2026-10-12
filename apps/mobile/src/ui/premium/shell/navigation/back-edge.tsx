import { Platform, StyleSheet, View } from 'react-native';

/** Wide enough for a thumb starting at the bezel, narrow enough to leave the map its pans. */
const EDGE_WIDTH = 20;

/**
 * A see-through strip down the left edge of a page whose content pans (a map). On iOS the
 * content's own pan gesture otherwise takes a swipe that starts at the edge, so the page never
 * goes back; touches in the strip never reach the content, and the navigation's edge swipe gets
 * them. Lay it right after the panning content so the page's controls stay above it. Android's
 * back gesture belongs to the system and needs nothing.
 */
export function BackEdge() {
  if (Platform.OS !== 'ios') return null;
  return <View style={styles.edge} testID="back-edge" />;
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_WIDTH },
});
