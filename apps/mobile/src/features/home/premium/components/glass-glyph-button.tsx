/**
 * A 44 pt glass circle holding a Home glyph, with an optional pink count badge (min 18, r9, 2 pt
 * ground ring, 10/700 on-accent ink) at its top corner. The ink variant is the screen's one `+`.
 */
import { View } from 'react-native';

import {
  GlassSurface,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { HomeGlyph, type HomeGlyphName } from './home-glyph';

const useStyles = makePremiumStyles((t) => ({
  circle: {
    width: t.size.glassNav,
    height: t.size.glassNav,
    borderRadius: t.radius.glassNav,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    end: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: t.accent.pink,
    borderWidth: 2,
    borderColor: t.color.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface GlassGlyphButtonProps {
  readonly glyph: HomeGlyphName;
  readonly label: string;
  readonly onPress: () => void;
  readonly count?: number;
  readonly kind?: 'nav' | 'clear';
  readonly testID?: string;
}

export function GlassGlyphButton({
  glyph,
  label,
  onPress,
  count = 0,
  kind = 'nav',
  testID,
}: GlassGlyphButtonProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const shown = count > 99 ? '99+' : String(count);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={count > 0 ? `${label}, ${shown}` : label}
      {...(testID === undefined ? {} : { testID })}
    >
      <GlassSurface kind={kind} interactive style={styles.circle}>
        <HomeGlyph
          name={glyph}
          size={t.size.glyph}
          color={kind === 'clear' ? t.material.clear.foreground : t.material.nav.foreground}
        />
      </GlassSurface>
      {count > 0 ? (
        <View style={styles.badge} pointerEvents="none">
          <Text variant="tier" tone="onAccent">
            {shown}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}
