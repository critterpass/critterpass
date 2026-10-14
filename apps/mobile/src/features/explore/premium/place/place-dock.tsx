/**
 * The place page's dock (4.36): Add (at the slot it names) and, beside it, the guide's circle:
 * white and raised with the guide centred in it, as tall as Add and on the same line.
 */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { Button, CritterSticker, PressableScale, usePremiumTheme } from '@/ui/premium';

import type { PlaceDetailViewProps } from '../../place-detail/place-detail-props';

export function PlaceDock(props: {
  readonly cta: PlaceDetailViewProps['cta'];
  readonly guide: { readonly kind: string; readonly name: string };
  readonly onChat: (() => void) | undefined;
  /** From the screen's foot to the dock's. */
  readonly bottom: number;
}) {
  const theme = usePremiumTheme();
  const { cta, guide } = props;
  const circle = theme.size.button;
  return (
    <View
      style={[
        styles.dock,
        { bottom: props.bottom, paddingHorizontal: theme.space.gap16, gap: theme.space.gap10 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Button
          label={cta.label}
          onPress={cta.onPress}
          disabled={cta.disabled}
          loading={cta.busy}
          testID="place-detail-cta"
        />
      </View>
      {props.onChat === undefined ? null : (
        <PressableScale
          onPress={props.onChat}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'explore.premium.place.ask', message: `Ask ${guide.name}` })}
          testID="place-detail-chat"
          style={{
            width: circle,
            height: circle,
            borderRadius: circle / 2,
            backgroundColor: theme.color.card,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: theme.shadow.raised,
          }}
        >
          <CritterSticker kind={guide.kind} name={guide.name} size={40} edge={false} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
