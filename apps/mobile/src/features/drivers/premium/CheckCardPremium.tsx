/**
 * Is this right? (6.22): the card read from what was shared, every line unconfirmed. Tapping a
 * line confirms it (mint check) and shows the words it came from in the peek card; the pencil turns
 * the value into a field in place, and Done on the keyboard closes it. What the price does not say
 * becomes the guide's question, opened in the traveller's WhatsApp. Nothing reaches the crew until
 * every line with a value is confirmed ("Confirm 2 more").
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewAccent } from '@/features/trip';
import {
  Avatar,
  Banner,
  Button,
  PressableScale,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { CARD_LINES, editText } from '../intake/check/card-lines';
import { useCheckCard, type CheckCardInput } from '../intake/check/use-check-card';
import { AskBar, CheckCircle, IncludesChips, PeekCard, PriceLines } from './components/CheckParts';
import { CouldntReadPremium } from './components/CouldntRead';

/** The fix mark of a card line: the icon set has no pencil, so the text one is drawn. */
const PENCIL = '✎';

export function CheckCardPremium(props: CheckCardInput) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const check = useCheckCard(props);
  const { plan, current, checked, editing, toggle, required, left, name, label } = check;
  if (check.readNothing) {
    return (
      <CouldntReadPremium
        guide={plan.guide}
        source={check.source}
        parsed={check.parsed}
        onType={check.startTyping}
      />
    );
  }
  const count = t({
    id: 'drivers.check.count',
    message: `${required.length - left.length} of ${required.length} checked`,
  });
  const divider = { borderTopWidth: 0.5, borderTopColor: th.color.hairline };
  return (
    <PushScreen
      title={t({ id: 'drivers.premium.checkTitle', message: 'Is this right?' })}
      subtitle={count}
      backLabel={t({ id: 'drivers.back.add', message: 'Add a driver' })}
      scroll={false}
      testID="drivers-check"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.body,
          {
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.check.intro',
            message: 'Tap each line to confirm or fix it. Nothing reaches the crew until you do.',
          })}
        </Text>
        {check.span === undefined || check.source === '' ? null : (
          <PeekCard source={check.source} span={check.span} />
        )}
        <View
          style={[
            styles.card,
            {
              borderRadius: th.radius.cardLarge,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
        >
          <View style={[styles.head, styles.dashed, { borderBottomColor: th.color.hairline }]}>
            <Avatar name={name === '' ? '?' : name} color={crewAccent(2)} size={48} />
            <PressableScale
              onPress={() => toggle('name')}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked.has('name') }}
              accessibilityLabel={label.name}
              style={styles.flex}
              testID="drivers-check-line-name"
            >
              <Text variant="title">{name === '' ? '—' : name}</Text>
              {current.area === null ? null : (
                <Text variant="caption" tone="muted">
                  {t({ id: 'drivers.check.area', message: `Driver · ${current.area}` })}
                </Text>
              )}
            </PressableScale>
            <CheckCircle on={checked.has('name')} label={label.name} />
          </View>
          {editing === 'name' ? (
            <View style={[styles.line, divider]}>
              <View style={styles.flex}>
                <TextField
                  accessibilityLabel={label.name}
                  value={current.name ?? ''}
                  onChangeText={(text) => check.edit('name', text)}
                  onSubmitEditing={() => check.setEditing(null)}
                  returnKeyType="done"
                  autoFocus
                  testID="drivers-check-edit-name"
                />
              </View>
            </View>
          ) : null}
          {CARD_LINES.map((field) => {
            const on = checked.has(field);
            if (field === 'includes') {
              return (
                <View key={field} style={[styles.line, divider]}>
                  <View style={[styles.flex, styles.gap]}>
                    <Text variant="captionMuted" tone="muted">
                      {label.includes}
                    </Text>
                    <IncludesChips
                      card={current}
                      includeLabel={check.includeLabel}
                      onChange={check.setCard}
                    />
                  </View>
                  <CheckCircle
                    on={on}
                    label={label.includes}
                    onPress={() => toggle(field)}
                    testID="drivers-check-line-includes"
                  />
                </View>
              );
            }
            const value = check.lineText(field);
            const asking = field === 'price' && check.priceAsk !== null;
            if (value === null && editing !== field && !check.typing && !asking) return null;
            const canCheck = !(asking && editing !== field);
            return (
              <View key={field} style={[styles.line, divider]}>
                <CheckCircle
                  on={on}
                  label={label[field]}
                  onPress={canCheck ? () => toggle(field) : undefined}
                  testID={`drivers-check-line-${field}`}
                />
                <View style={styles.flex}>
                  <Text variant="captionMuted" tone="muted">
                    {label[field]}
                  </Text>
                  {editing === field ? (
                    <TextField
                      accessibilityLabel={label[field]}
                      value={editText(current, field)}
                      onChangeText={(text) => check.edit(field, text)}
                      onSubmitEditing={() => check.setEditing(null)}
                      returnKeyType="done"
                      autoFocus
                      testID={`drivers-check-edit-${field}`}
                    />
                  ) : (
                    <Text
                      variant="rowTextStrong"
                      onPress={asking ? undefined : () => toggle(field)}
                    >
                      {value ??
                        (asking
                          ? t({ id: 'drivers.check.priceAsk', message: 'Ask the driver' })
                          : '—')}
                    </Text>
                  )}
                  {field === 'price' ? <PriceLines card={current} /> : null}
                </View>
                <PressableScale
                  onPress={() => check.setEditing(editing === field ? null : field)}
                  accessibilityRole="button"
                  accessibilityLabel={t({ id: 'drivers.check.fix', message: 'Fix' })}
                  style={styles.fix}
                  testID={`drivers-check-fix-${field}`}
                >
                  <Text variant="body" tone="muted">
                    {PENCIL}
                  </Text>
                </PressableScale>
              </View>
            );
          })}
        </View>
        {check.asked === 0 || current.phone === null ? null : (
          <AskBar guide={plan.guide} name={name} count={check.asked} url={check.askUrl} />
        )}
        {check.error ? (
          <Banner
            tone="error"
            text={t({
              id: 'drivers.check.error',
              message: 'That didn’t save. Check you’re online and try again.',
            })}
          />
        ) : null}
        <Button
          label={
            left.length > 0
              ? t({ id: 'drivers.check.confirmMore', message: `Confirm ${left.length} more` })
              : t({ id: 'drivers.check.confirm', message: 'Add to the shortlist' })
          }
          size="large"
          disabled={left.length > 0 || name === '' || check.pending}
          onPress={() => void check.save()}
          testID="drivers-check-confirm"
        />
      </ScrollView>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8 },
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: 6 },
  card: { overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dashed: { borderBottomWidth: 1.5, borderStyle: 'dashed' },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  fix: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
