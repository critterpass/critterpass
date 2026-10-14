/**
 * Add an expense (7.18), full screen with ✕ (asks first when something was typed) and "Scan
 * instead". The amount in its own currency, large, with what it comes to in the crew's currency
 * and each person's part; tapping the currency picks another. What it was (the category follows
 * the words until one is picked) and the day; who paid; Evenly / By share / Custom and who is in;
 * then the number pad and "Add Rp 450k". Saving queues offline; Balances re-counts.
 */
import type { ExpenseCategory } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import {
  Button,
  EmptyState,
  hitSlopFor,
  PressableScale,
  SegmentedControl,
  Skeleton,
  Tag,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { askToDiscard, FullScreen } from '@/ui/premium/shell';

import { daysBackOf } from '../add-expense/spent-day';
import { sharesByMember, type SplitEditorMode } from '../add-expense/draft';
import { useAddExpense } from '../add-expense/use-add-expense';
import { CATEGORY_ORDER, useCategoryLabel } from '../components/category';
import { MONEY_FALLBACK } from '../routes';
import { formatPlain, symbolOf } from '../format';
import { AmountKeypad } from './components/AmountKeypad';
import { ChoiceStrip } from './components/ChoiceStrip';
import { PayerRow } from './components/PayerRow';
import { SpentDayLine } from './components/SpentDayLine';
import { SplitPeople } from './components/SplitPeople';

type Open = 'currency' | 'category' | 'day' | null;

/** The currency symbol and the category tag are smaller than a finger: reach 44 pt around them. */
const SMALL_TARGET = hitSlopFor(28, 28);

export function AddExpensePremium(props: {
  readonly editId: string | null;
  readonly prefillName: string | null;
  readonly tripId: string | null;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const state = useAddExpense(props.editId, props.prefillName, props.tripId);
  const categoryLabel = useCategoryLabel();
  const [open, setOpen] = useState<Open>(null);
  const { draft, ctx } = state;
  const closeLabel = t({ id: 'money.premium.close', message: 'Close' });
  // Any change from where the draft started asks first: payer, split, category and day too.
  const dirty = state.dirty;
  const close = () => {
    if (!dirty) {
      goBackOr(MONEY_FALLBACK);
      return;
    }
    void askToDiscard({
      title: t({ id: 'money.premium.discardTitle', message: 'Discard this expense?' }),
      message: t({ id: 'money.premium.discardLine', message: 'What you typed goes.' }),
      discard: t({ id: 'money.premium.discard', message: 'Discard' }),
      keep: t({ id: 'money.premium.keepEditing', message: 'Keep editing' }),
    }).then((discard) => {
      if (discard) goBackOr(MONEY_FALLBACK);
    });
  };

  if (state.loading || ctx.crew === null || ctx.trip === null || !state.ready) {
    return (
      <FullScreen closeLabel={closeLabel} overPhoto={false} testID="money-add-waiting">
        <View
          style={[styles.root, { backgroundColor: th.color.ground, paddingTop: insets.top + 80 }]}
        >
          {/* "No trip" only once the context says so: a ready context still seeding waits. */}
          {state.loading || ctx.status === 'ready' ? (
            <View style={{ padding: th.space.gutter, gap: th.space.gap12 }}>
              <Skeleton height={60} radius={th.radius.card} />
              <Skeleton height={240} radius={th.radius.card} />
            </View>
          ) : (
            <EmptyState
              title={t({ id: 'money.premium.noTripTitle', message: 'No trip to add it to' })}
              line={t({
                id: 'money.premium.noTripLine',
                message: 'Expenses belong to a trip. Start one with the crew, then add it here.',
              })}
            />
          )}
        </View>
      </FullScreen>
    );
  }
  const members = ctx.members.filter((member) => draft.memberIds.includes(member.userId));
  const amount = draft.digits === '' ? '0' : formatPlain(state.amountMinor, draft.currency, locale);
  const now = new Date();
  const daysBack = daysBackOf(draft.spentAt, now);
  const modes: { value: SplitEditorMode; label: string }[] = [
    { value: 'equal', label: t({ id: 'money.premium.evenly', message: 'Evenly' }) },
    { value: 'weights', label: t({ id: 'money.premium.byShare', message: 'By share' }) },
    { value: 'fixed', label: t({ id: 'money.premium.custom', message: 'Custom' }) },
  ];
  const toggle = (next: Open) => setOpen((current) => (current === next ? null : next));
  return (
    <FullScreen closeLabel={closeLabel} overPhoto={false} onClose={close} testID="money-add">
      <View
        style={[
          styles.root,
          { backgroundColor: th.color.ground, paddingTop: insets.top + th.space.gap6 },
        ]}
      >
        <View style={[styles.top, { paddingLeft: 80, paddingRight: th.space.gutter }]}>
          <Text variant="label" tone="muted" style={styles.flex} numberOfLines={1}>
            {state.editing
              ? t({ id: 'money.premium.editTitle', message: `Edit expense · ${ctx.crew.name}` })
              : t({ id: 'money.premium.newTitle', message: `New expense · ${ctx.crew.name}` })}
          </Text>
          {state.editing ? null : (
            <Button
              alignSelf="auto"
              label={t({ id: 'money.premium.scanInstead', message: 'Scan instead' })}
              variant="floating"
              size="small"
              onPress={state.scanInstead}
              testID="money-scan-instead"
            />
          )}
        </View>
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{
            gap: th.space.gap14,
            paddingTop: th.space.gap16,
            paddingBottom: th.space.gap12,
          }}
        >
          <View style={styles.amount}>
            <View style={styles.amountRow}>
              <PressableScale
                onPress={() => toggle('currency')}
                hitSlop={SMALL_TARGET}
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'money.premium.currency',
                  message: `Currency, ${draft.currency}`,
                })}
                testID="money-add-currency"
              >
                <Text variant="title" tone="placeholder">
                  {symbolOf(draft.currency)}
                </Text>
              </PressableScale>
              <Text
                variant="hero"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={styles.tabular}
                testID="money-add-amount"
              >
                {amount}
              </Text>
            </View>
            {state.labels.approx === undefined ? null : (
              <Text variant="rowText" tone="muted">
                {state.labels.approx}
              </Text>
            )}
          </View>
          {open === 'currency' ? (
            <ChoiceStrip
              choices={state.currencies.map((code) => ({
                value: code,
                label: `${symbolOf(code)} ${code}`,
              }))}
              value={draft.currency}
              onPick={(currency) => {
                state.dispatch({ type: 'currency', currency });
                setOpen(null);
              }}
              testID="money-add-currencies"
            />
          ) : null}
          <View style={[styles.what, { paddingHorizontal: th.space.gutter }]}>
            <View style={styles.flex}>
              <TextField
                accessibilityLabel={t({ id: 'money.premium.what', message: 'What was it?' })}
                placeholder={t({ id: 'money.premium.what', message: 'What was it?' })}
                value={draft.description}
                onChangeText={(text) => state.dispatch({ type: 'description', text })}
                autoCapitalize="sentences"
                returnKeyType="done"
                testID="money-add-description"
              />
            </View>
            <PressableScale
              onPress={() => toggle('category')}
              hitSlop={SMALL_TARGET}
              accessibilityRole="button"
              testID="money-add-category"
            >
              <Tag label={categoryLabel(draft.category)} color={th.accent.pink} rotate={-4} />
            </PressableScale>
          </View>
          {open === 'category' ? (
            <ChoiceStrip<ExpenseCategory>
              choices={CATEGORY_ORDER.map((category) => ({
                value: category,
                label: categoryLabel(category),
              }))}
              value={draft.category}
              onPick={(category) => {
                state.dispatch({ type: 'category', category });
                setOpen(null);
              }}
              testID="money-add-categories"
            />
          ) : null}
          <PayerRow
            members={members}
            payerId={draft.payerId}
            onPayer={(userId) => state.dispatch({ type: 'payer', userId })}
          />
          <SpentDayLine
            daysBack={daysBack}
            open={open === 'day'}
            onToggle={() => toggle('day')}
            onPick={(back) => {
              state.setDay(back);
              setOpen(null);
            }}
          />
          <View style={{ paddingHorizontal: th.space.gap16 }}>
            <SegmentedControl<SplitEditorMode>
              accessibilityLabel={t({ id: 'money.premium.split', message: 'How it splits' })}
              options={modes}
              value={draft.mode}
              onChange={(mode) => state.dispatch({ type: 'mode', mode })}
              testID="money-add-mode"
            />
          </View>
          <SplitPeople
            draft={draft}
            members={members}
            perMember={sharesByMember(draft)}
            onToggle={(userId) => state.dispatch({ type: 'toggle', userId })}
            onStep={(userId, delta) => state.dispatch({ type: 'weight', userId, delta })}
            onFocus={(userId) => state.dispatch({ type: 'focus', userId })}
          />
        </ScrollView>
        <View
          style={{
            paddingHorizontal: th.space.gutter,
            paddingBottom: insets.bottom + th.space.gap8,
            gap: th.space.gap10,
          }}
        >
          <AmountKeypad
            onKey={(key) => state.dispatch({ type: 'key', key })}
            deleteLabel={t({ id: 'money.premium.delete', message: 'Delete a digit' })}
          />
          <Button
            label={state.labels.cta}
            disabled={state.amountMinor === 0n || state.sent}
            loading={state.pending}
            onPress={state.submit}
            testID="money-add-submit"
          />
        </View>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  amount: { alignItems: 'center', gap: 2, paddingHorizontal: 20 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  tabular: { fontVariant: ['tabular-nums'] },
  what: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
