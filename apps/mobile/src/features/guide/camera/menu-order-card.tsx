/**
 * The order card of point and ask (3j-3, ORDER FOR 6): the dishes the guide read, each in the
 * menu's own words with its translation underneath; a tap adds one, the minus takes one away.
 * SHOW THE ORDER opens the order full screen in the menu's language for the person taking it,
 * and the same dishes can start an expense to split. Built from the panel's own text and button
 * parts (an undesigned state, logged in docs/undesigned-states.md).
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { Row, Stack, Text, makeStyles, sizeToken, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { PressScale } from '@/ui/press/PressScale';

import { MENU_ORDER_MAX, type MenuOrder, type MenuSticker } from './menu-scan';

export interface MenuOrderCardProps {
  readonly guideName: string;
  readonly crewSize: number;
  readonly stickers: readonly MenuSticker[];
  readonly order: MenuOrder;
  readonly onChange: (id: string, by: 1 | -1) => void;
  /** The order full screen, to show the person taking it. */
  readonly onShow: () => void;
  /** Starts an expense named for the dishes; absent outside a trip. */
  readonly onSplit?: () => void;
  /** Asks the guide what this group should order. */
  readonly onAsk: () => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  list: { maxHeight: sizeToken(t.size.chip, 'hitTarget') * 4.5 },
  row: {
    minHeight: sizeToken(t.size.chip, 'hitTarget'),
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['8'],
    backgroundColor: t.semantic.bg.control,
    flex: 1,
  },
  dish: { flex: 1 },
  less: {
    width: sizeToken(t.size.chip, 'hitTarget'),
    height: sizeToken(t.size.chip, 'hitTarget'),
    borderRadius: sizeToken(t.size.chip, 'hitTarget') / 2,
    backgroundColor: t.semantic.bg.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function MenuOrderCard(props: MenuOrderCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const { crewSize, guideName } = props;
  const picked = props.stickers.some((sticker) => (props.order[sticker.id] ?? 0) > 0);
  return (
    <View testID="guide-camera-order">
      <Stack gap="12">
        <Row gap="12" align="center" justify="space-between">
          <Text variant="label" color={theme.semantic.text.secondary}>
            {upper(
              crewSize > 1
                ? t({ id: 'guide.camera.orderFor', message: `Order for ${crewSize}` })
                : t({ id: 'guide.camera.orderTitle', message: 'Your order' }),
              i18n.locale,
            )}
          </Text>
          <TextLink
            label={t({ id: 'guide.camera.orderClose', message: 'Back to the menu' })}
            onPress={props.onClose}
            testID="guide-camera-order-close"
          />
        </Row>
        <ScrollView style={styles.list} contentContainerStyle={{ gap: theme.space['8'] }}>
          {props.stickers.map((sticker) => {
            const count = props.order[sticker.id] ?? 0;
            const name = sticker.name;
            return (
              <Row key={sticker.id} gap="8" align="center">
                <PressScale
                  accessibilityLabel={t({
                    id: 'guide.camera.orderAdd',
                    message: `Add one ${name}`,
                  })}
                  accessibilityValue={{ text: String(count) }}
                  disabled={count >= MENU_ORDER_MAX}
                  onPress={() => props.onChange(sticker.id, 1)}
                  style={styles.row}
                  testID={`guide-camera-order-add-${sticker.id}`}
                >
                  <Row gap="12" align="center">
                    <View style={styles.dish}>
                      <Text variant="body" singleLine={false}>
                        {name}
                      </Text>
                      <Text variant="caption" color={theme.semantic.text.secondary}>
                        {sticker.translation}
                      </Text>
                    </View>
                    {count === 0 ? null : (
                      <Text
                        variant="buttonSm"
                        color={theme.color.yellow}
                        testID={`guide-camera-order-count-${sticker.id}`}
                      >
                        {`× ${count}`}
                      </Text>
                    )}
                  </Row>
                </PressScale>
                {count === 0 ? null : (
                  <PressScale
                    accessibilityLabel={t({
                      id: 'guide.camera.orderLess',
                      message: `One fewer ${name}`,
                    })}
                    onPress={() => props.onChange(sticker.id, -1)}
                    widthClass="narrow"
                    style={styles.less}
                    testID={`guide-camera-order-less-${sticker.id}`}
                  >
                    <Text variant="buttonSm">−</Text>
                  </PressScale>
                )}
              </Row>
            );
          })}
        </ScrollView>
        <PillButton
          label={t({ id: 'guide.camera.orderShow', message: 'Show the order' })}
          onPress={props.onShow}
          disabled={!picked}
          testID="guide-camera-order-show"
        />
        <Row gap="16" wrap>
          {props.onSplit === undefined || !picked ? null : (
            <TextLink
              label={t({ id: 'guide.camera.split', message: 'Split the bill' })}
              onPress={props.onSplit}
              testID="guide-camera-order-split"
            />
          )}
          <TextLink
            label={t({
              id: 'guide.camera.orderAsk',
              message: `Ask ${guideName} what to order`,
            })}
            onPress={props.onAsk}
            testID="guide-camera-order-ask"
          />
        </Row>
      </Stack>
    </View>
  );
}
