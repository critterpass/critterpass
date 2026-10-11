/**
 * The add bar over the half sheet's foot (4.26): the ink `+`, "Add to Wed, or paste a link" and
 * the guide. Tapping it opens Find scoped to the day; it never takes text here.
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

const useStyles = makePremiumStyles((t) => ({
  bar: {
    height: 54,
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
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="plan-add-bar"
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
  );
}
