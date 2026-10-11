/**
 * Point and ask's order (5.16, "Order for 6"): each dish the guide read in the menu's words with
 * its translation, a tap adds one and the minus takes one away, Show the order for the person
 * taking it, Split the bill, and ask the guide what to order. Undesigned in the premium set.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import {
  Button,
  PressableScale,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import type { MenuOrderCardProps } from '../../camera/menu-order-card';
import { MENU_ORDER_MAX } from '../../camera/menu-scan';

const useStyles = makePremiumStyles((th) => ({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: th.radius.field,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  less: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.control,
  },
}));

export function PremiumOrderCard(props: MenuOrderCardProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const { crewSize, guideName } = props;
  const picked = props.stickers.some((sticker) => (props.order[sticker.id] ?? 0) > 0);
  return (
    <View style={{ gap: 10 }} testID="guide-camera-order">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" tone="muted">
          {crewSize > 1
            ? t({ id: 'guide.camera.orderFor', message: `Order for ${crewSize}` })
            : t({ id: 'guide.camera.orderTitle', message: 'Your order' })}
        </Text>
        <TextButton
          label={t({ id: 'guide.camera.orderClose', message: 'Back to the menu' })}
          onPress={props.onClose}
          testID="guide-camera-order-close"
        />
      </View>
      <ScrollView style={{ maxHeight: 230 }} contentContainerStyle={{ gap: 8 }}>
        {props.stickers.map((sticker) => {
          const count = props.order[sticker.id] ?? 0;
          const name = sticker.name;
          return (
            <View key={sticker.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PressableScale
                style={styles.row}
                onPress={() => props.onChange(sticker.id, 1)}
                disabled={count >= MENU_ORDER_MAX}
                accessibilityRole="button"
                accessibilityLabel={t({ id: 'guide.camera.orderAdd', message: `Add one ${name}` })}
                accessibilityValue={{ text: String(count) }}
                testID={`guide-camera-order-add-${sticker.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle">{name}</Text>
                  <Text variant="captionMuted" tone="muted">
                    {sticker.translation}
                  </Text>
                </View>
                {count === 0 ? null : (
                  <Text
                    variant="rowTitle"
                    color={th.color.status.maybe.text}
                    testID={`guide-camera-order-count-${sticker.id}`}
                  >
                    {`× ${String(count)}`}
                  </Text>
                )}
              </PressableScale>
              {count === 0 ? null : (
                <PressableScale
                  style={styles.less}
                  onPress={() => props.onChange(sticker.id, -1)}
                  accessibilityRole="button"
                  accessibilityLabel={t({
                    id: 'guide.camera.orderLess',
                    message: `One fewer ${name}`,
                  })}
                  testID={`guide-camera-order-less-${sticker.id}`}
                >
                  <Text variant="rowTitle">−</Text>
                </PressableScale>
              )}
            </View>
          );
        })}
      </ScrollView>
      <Button
        label={t({ id: 'guide.camera.orderShow', message: 'Show the order' })}
        onPress={props.onShow}
        disabled={!picked}
        testID="guide-camera-order-show"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
        {props.onSplit === undefined || !picked ? null : (
          <TextButton
            label={t({ id: 'guide.camera.split', message: 'Split the bill' })}
            onPress={props.onSplit}
            testID="guide-camera-order-split"
          />
        )}
        <TextButton
          label={t({ id: 'guide.camera.orderAsk', message: `Ask ${guideName} what to order` })}
          onPress={props.onAsk}
          testID="guide-camera-order-ask"
        />
      </View>
    </View>
  );
}
