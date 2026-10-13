/**
 * Type the lines in the premium look (undesigned; the nearest is 7.20's fix in place): the prices
 * the guide could read are already in, each line is a card with its name, the amount the number pad
 * types into while the line is picked, and who had it. Under the lines, what they come to against
 * the printed total (the rest is shared by share; more than the total is refused), the pad, and
 * "Split it". The ✕ leaves the scan.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBackOr } from '@/lib/navigation/back';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  PressableScale,
  Text,
  TextButton,
  TextField,
  ring,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { unitsToMinor } from '../../add-expense/draft';
import { MONEY_FALLBACK } from '../../routes';
import { formatAmount } from '../../format';
import type { TypeLinesEditorProps } from '../../receipt/view-types';
import { AmountKeypad } from '../components/AmountKeypad';

export function TypeLinesEditorPremium(props: TypeLinesEditorProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const typed = props.lines.reduce(
    (sum, line) => sum + unitsToMinor(line.digits, props.currency),
    0n,
  );
  const typedText = formatAmount(typed, props.currency, locale);
  const totalText =
    props.totalMinor === null ? null : formatAmount(props.totalMinor, props.currency, locale);
  const over = props.totalMinor !== null && typed > props.totalMinor;
  const payer = props.payerName;
  return (
    <FullScreen
      closeLabel={t({ id: 'money.scan.close', message: 'Close the scan' })}
      overPhoto={false}
      onClose={() => goBackOr(MONEY_FALLBACK)}
      testID="money-type-lines"
    >
      <View style={[styles.root, { backgroundColor: th.color.ground }]}>
        <ScrollView
          style={styles.root}
          contentContainerStyle={{
            paddingTop: insets.top + th.size.glassNav + th.space.gap16,
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
          }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text variant="largeTitle" accessibilityRole="header">
            {t({ id: 'money.typeLines.title', message: 'Type the lines' })}
          </Text>
          {props.lines.map((line) => {
            const focused = props.focus === line.id;
            return (
              <PressableScale
                key={line.id}
                onPress={() => props.onFocus(line.id)}
                pressedScale={0.99}
                testID={`money-typed-${line.id}`}
              >
                <View
                  style={[
                    styles.card,
                    {
                      borderRadius: th.radius.card,
                      backgroundColor: th.color.card,
                      boxShadow: focused
                        ? `${ring(th.size.focusRing, th.color.ink)}, ${th.shadow.card}`
                        : th.shadow.card,
                    },
                  ]}
                >
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <TextField
                        value={line.label}
                        onChangeText={(text) => props.onLabel(line.id, text)}
                        onFocus={() => props.onFocus(line.id)}
                        placeholder={t({
                          id: 'money.typeLines.namePlaceholder',
                          message: 'What was it?',
                        })}
                        accessibilityLabel={t({ id: 'money.typeLines.name', message: 'Line name' })}
                      />
                    </View>
                    <Text variant="rowTitle" style={styles.tabular}>
                      {formatAmount(
                        unitsToMinor(line.digits, props.currency),
                        props.currency,
                        locale,
                      )}
                    </Text>
                  </View>
                  <TextButton label={props.whoLabel(line)} onPress={() => props.onWho(line.id)} />
                </View>
              </PressableScale>
            );
          })}
          <TextButton
            label={t({ id: 'money.typeLines.add', message: 'Add a line' })}
            tone="ink"
            onPress={props.onAddLine}
            testID="money-typed-add"
          />
        </ScrollView>
        <View
          style={{
            paddingHorizontal: th.space.gutter,
            paddingTop: th.space.gap8,
            paddingBottom: insets.bottom + th.space.gap8,
            gap: th.space.gap8,
          }}
        >
          <Text
            variant="caption"
            {...(over ? { color: th.color.destructive.text } : { tone: 'muted' as const })}
            accessibilityLiveRegion="polite"
            testID="money-typed-count"
          >
            {totalText === null
              ? t({ id: 'money.typeLines.countNoTotal', message: `Lines: ${typedText}` })
              : over
                ? t({
                    id: 'money.typeLines.over',
                    message: `Lines: ${typedText}, more than the ${totalText} on the receipt`,
                  })
                : t({
                    id: 'money.typeLines.count',
                    message: `Lines: ${typedText} of ${totalText}. The rest is shared by share.`,
                  })}
          </Text>
          <AmountKeypad
            onKey={props.onKey}
            deleteLabel={t({ id: 'money.premium.delete', message: 'Delete a digit' })}
          />
          <Button
            label={t({ id: 'money.premium.splitIt', message: `Split it · ${payer} paid` })}
            onPress={props.onCommit}
            disabled={!props.canCommit}
            loading={props.committing}
            testID="money-typed-commit"
          />
        </View>
      </View>
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { padding: 14, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
});
