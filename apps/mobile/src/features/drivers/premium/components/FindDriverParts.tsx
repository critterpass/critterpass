/**
 * Find a driver's pieces (6.19): a source card (tilted sticker tile, title, line and its small
 * action) and the ink shortlist bar docked at the bottom with the sun Compare.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { crewAccent, IconTile, turn, type LineIconName } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { CrewStack, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { ShortlistDriver } from '../../shared/api';

export function Source(props: {
  readonly icon: LineIconName;
  readonly tint: { bg: string; text: string };
  readonly tilt: number;
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      testID={props.testID}
    >
      <View
        style={[
          styles.source,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <View style={{ transform: [turn(props.tilt)] }}>
          <IconTile name={props.icon} bg={props.tint.bg} color={props.tint.text} size={50} />
        </View>
        <View style={styles.flex}>
          <Text variant="headline">{props.title}</Text>
          <Text variant="caption" tone="muted">
            {props.body}
          </Text>
        </View>
        <View style={[styles.cta, { backgroundColor: th.color.control }]}>
          <Text variant="noteAction">{props.cta}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

export function ShortlistBar(props: {
  readonly drivers: readonly ShortlistDriver[];
  readonly bottom: number;
  readonly onCompare: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  return (
    <View
      style={[
        styles.bar,
        {
          bottom: props.bottom,
          left: th.space.gutter,
          right: th.space.gutter,
          backgroundColor: th.color.inkSurface,
          boxShadow: th.shadow.toastInk,
        },
      ]}
    >
      <CrewStack
        members={props.drivers.map((driver, at) => ({
          id: driver.id,
          name: driver.name,
          color: crewAccent(at + 5),
        }))}
        size={32}
        accessibilityLabel={props.drivers.map((d) => d.name).join(', ')}
      />
      <View style={styles.flex}>
        <Text variant="captionMuted" color={th.color.onInkSurface} style={styles.soft}>
          {t({
            id: 'drivers.premium.shortlistCount',
            message: `Shortlist · ${props.drivers.length}`,
          })}
        </Text>
        <Text variant="rowTextStrong" color={th.color.onInkSurface} numberOfLines={1}>
          {format.list(
            locale,
            props.drivers.map((driver) => driver.name),
          )}
        </Text>
      </View>
      <PressableScale
        onPress={props.onCompare}
        accessibilityRole="button"
        testID="drivers-find-compare"
      >
        <View style={[styles.compare, { backgroundColor: th.accent.sun }]}>
          <Text variant="rowTextStrong" color={th.color.onAccent}>
            {t({ id: 'drivers.find.compare', message: 'Compare' })}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  cta: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center' },
  bar: {
    position: 'absolute',
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
    paddingRight: 9,
  },
  soft: { opacity: 0.7 },
  compare: { height: 46, borderRadius: 23, paddingHorizontal: 18, justifyContent: 'center' },
});
