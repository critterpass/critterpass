/**
 * The add bar over the half sheet's foot (4.26): the ink `+`, "Add to Wed, or paste a link" and
 * the guide. Tapping it opens Find scoped to the day; it never takes text here. It floats over the
 * sheet's foot, and the list fades out behind and under it, so no card edge shows past the bar.
 */
import { View } from 'react-native';

import {
  CritterSticker,
  Icon,
  makePremiumStyles,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';

import { SCROLL_EDGE_FADE, ScrollEdgeFade } from '@/ui/premium/shell';

/** How far the bar floats over the sheet's foot, and its height. */
const DOCK_BOTTOM = 28;
const BAR_HEIGHT = 54;

const useStyles = makePremiumStyles((t) => ({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: DOCK_BOTTOM,
    paddingHorizontal: t.space.gap16,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: 27,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.toast,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: t.space.gap8,
    paddingEnd: t.space.gap6,
    gap: t.space.gap10,
  },
  plus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.color.inkSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.color.status.maybe.bg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
}));

export function AddBar({
  label,
  guide,
  onPress,
}: {
  readonly label: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  const t = usePremiumTheme();
  return (
    <View style={styles.dock}>
      <ScrollEdgeFade
        edge="bottom"
        height={DOCK_BOTTOM + BAR_HEIGHT + SCROLL_EDGE_FADE}
        solid={DOCK_BOTTOM + BAR_HEIGHT / 2}
        offset={-DOCK_BOTTOM}
        color={t.material.sheet.fill}
      />
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="plan-add-bar"
        // Over the fade, which the kit stacks above the list.
        style={{ zIndex: 2 }}
      >
        <View style={styles.bar}>
          <View style={styles.plus}>
            <Icon name="plus" size={18} color={t.color.onInk} />
          </View>
          <Text variant="body" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
            {label}
          </Text>
          <View style={styles.guide}>
            <CritterSticker kind={guide.kind} name={guide.name} size={38} pose="point" />
          </View>
        </View>
      </PressableScale>
    </View>
  );
}
