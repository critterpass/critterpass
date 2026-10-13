/**
 * How people pay you (7.27): "Only the person paying sees these." and one row per way your country
 * pays (bank transfer, PayNow, Wise, cash…). A saved one wears an ink check and the default says
 * so; tapping a row opens its fields in place (the open one closes), each with the keyboard it
 * needs; Save sends them encrypted, and "Make it the default" puts it first for payers.
 */
import type { PayoutKind } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTile, type LineIconName } from '@/features/trip';
import {
  Button,
  Icon,
  PressableScale,
  Skeleton,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
  type PremiumTheme,
} from '@/ui/premium';
import { KeyboardAwareScroll, KeyboardStickyFooter, PushScreen } from '@/ui/premium/shell';

import { PAYOUT_FIELDS, validDetails } from '../settle/payout-details';
import { usePayoutFieldLabel, usePayoutKindLabel } from '../settle/payout-labels';
import { usePayoutMethods } from '../settle/use-payout-methods';

function lookOf(
  kind: PayoutKind,
  th: PremiumTheme,
): { icon: LineIconName; bg: string; fg: string } {
  switch (kind) {
    case 'bank':
      return { icon: 'card', bg: th.color.status.rain.bg, fg: th.color.status.rain.text };
    case 'wise_link':
      return { icon: 'link', bg: th.color.status.booked.bg, fg: th.color.status.booked.text };
    case 'cash':
      return { icon: 'wallet', bg: th.color.status.maybe.bg, fg: th.color.status.maybe.text };
    case 'paynow':
    case 'promptpay':
    case 'vietqr':
    case 'duitnow':
      return { icon: 'qr', bg: th.color.status.voteOpen.bg, fg: th.color.status.voteOpen.text };
  }
}

function keyboardFor(field: string): 'phone-pad' | 'number-pad' | 'url' | 'default' {
  if (field === 'proxy') return 'phone-pad';
  if (field === 'account_number' || field === 'bank_bin' || field === 'acquirer_id') {
    return 'number-pad';
  }
  return field === 'url' ? 'url' : 'default';
}

export function PayoutMethodsPremium() {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  // Clears the home indicator with the keyboard down, and sits a gap above the keyboard when up.
  const footerPad = Math.max(insets.bottom, th.space.gap12);
  const { t } = useLingui();
  const kindLabel = usePayoutKindLabel();
  const fieldLabel = usePayoutFieldLabel();
  const methods = usePayoutMethods();
  const title = t({ id: 'money.premium.payoutTitle', message: 'Payout methods' });
  const fields = PAYOUT_FIELDS[methods.kind];
  const valid = validDetails(methods.kind, methods.values) !== null;
  const savedKinds = new Set(methods.saved.map((method) => method.kind));
  const isSaved = savedKinds.has(methods.kind);
  return (
    <PushScreen
      title={title}
      backLabel={t({ id: 'money.pay.back', message: 'Settle up' })}
      scroll={false}
      testID="money-payout-methods"
    >
      <KeyboardAwareScroll
        bottomOffset={th.size.button + th.space.gap12 + th.space.gap16}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40, gap: th.space.gap16 }}
      >
        <View style={{ paddingHorizontal: th.space.titleGutter, gap: th.space.gap4 }}>
          <Text variant="largeTitle" accessibilityRole="header">
            {t({ id: 'money.settle.payYou', message: 'How people pay you' })}
          </Text>
          <Text variant="label" tone="muted">
            {t({ id: 'money.premium.onlyPayer', message: 'Only the person paying sees these.' })}
          </Text>
        </View>
        {methods.loading ? (
          <View style={{ paddingHorizontal: th.space.gutter }}>
            <Skeleton height={240} radius={th.radius.cardLarge} />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              {
                marginHorizontal: th.space.gap16,
                borderRadius: th.radius.cardLarge,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.card,
              },
            ]}
          >
            {methods.kinds.map((kind, index) => {
              const look = lookOf(kind, th);
              const open = kind === methods.kind;
              const saved = savedKinds.has(kind);
              const sub =
                methods.defaultKind === kind
                  ? t({
                      id: 'money.premium.payoutDefault',
                      message: 'Default · payers see it first',
                    })
                  : saved
                    ? t({ id: 'money.premium.payoutSaved', message: 'Saved' })
                    : kind === 'cash'
                      ? t({
                          id: 'money.payout.cashLine',
                          message: 'People can hand it to you in person.',
                        })
                      : t({ id: 'money.premium.payoutAdd', message: 'Not set up' });
              return (
                <View
                  key={kind}
                  style={[
                    index === 0 ? null : { borderTopWidth: 0.5, borderTopColor: th.color.hairline },
                    open ? { backgroundColor: th.color.control } : null,
                  ]}
                >
                  <PressableScale
                    onPress={() => methods.pick(kind)}
                    pressedScale={0.99}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`${kindLabel(kind)}, ${sub}`}
                    testID={`money-payout-kind-${kind}`}
                  >
                    <View style={styles.row}>
                      <IconTile name={look.icon} bg={look.bg} color={look.fg} size={40} />
                      <View style={styles.flex}>
                        <Text variant="rowTitle">{kindLabel(kind)}</Text>
                        <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                          {sub}
                        </Text>
                      </View>
                      {saved ? (
                        <View style={[styles.check, { backgroundColor: th.color.ink }]}>
                          <Icon name="check" size={14} color={th.color.onInk} />
                        </View>
                      ) : null}
                    </View>
                  </PressableScale>
                  {open && fields.length > 0 ? (
                    <View style={styles.fields}>
                      {fields.map((field, at) => (
                        <TextField
                          key={field}
                          accessibilityLabel={fieldLabel(field)}
                          placeholder={fieldLabel(field)}
                          value={methods.values[field] ?? ''}
                          onChangeText={(value) => methods.setValue(field, value)}
                          keyboardType={keyboardFor(field)}
                          autoCapitalize={
                            field === 'swift'
                              ? 'characters'
                              : field.includes('name')
                                ? 'words'
                                : 'none'
                          }
                          autoCorrect={false}
                          returnKeyType={at === fields.length - 1 ? 'done' : 'next'}
                          testID={`money-payout-field-${field}`}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        {isSaved ? (
          <View style={styles.links}>
            {methods.defaultKind === methods.kind ? null : (
              <TextButton
                label={t({ id: 'money.premium.makeDefault', message: 'Make it the default' })}
                color={th.color.status.rain.text}
                onPress={() => void methods.save({ makeDefault: true })}
                testID="money-payout-default"
              />
            )}
            <TextButton
              label={t({ id: 'money.payout.remove', message: 'Remove' })}
              color={th.color.destructive.text}
              onPress={() => void methods.remove()}
              testID="money-payout-remove"
            />
          </View>
        ) : null}
      </KeyboardAwareScroll>
      <KeyboardStickyFooter openedOffset={th.space.gap12 - footerPad}>
        <View style={{ paddingHorizontal: th.space.titleGutter, paddingBottom: footerPad }}>
          <Button
            label={t({ id: 'money.payout.save', message: 'Save' })}
            disabled={!valid}
            loading={methods.busy}
            onPress={() => void methods.save()}
            testID="money-payout-save"
          />
        </View>
      </KeyboardStickyFooter>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 14,
  },
  flex: { flex: 1, minWidth: 0 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fields: { gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
});
