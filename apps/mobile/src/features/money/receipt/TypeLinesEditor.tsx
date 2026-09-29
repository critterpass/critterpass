/**
 * TYPE THE LINES (undesigned itemised manual editor): the prices Tokek could read are already in,
 * each row has a name, an amount the keypad types into when the row is picked, and who had it
 * (EVERYONE, or a picked few). The line under the keypad counts the typed lines against the
 * printed total; the rest is shared by share like a service charge. More than the total is refused.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Keypad, type KeypadKey } from '@/ui/inputs/Keypad';
import { useInputFont } from '@/ui/inputs/use-input-font';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { formatAmount } from '../format';
import { unitsToMinor } from '../add-expense/draft';
import type { TypedLine } from './type-lines-model';

const useStyles = makeStyles((t) => ({
  top: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingTop: t.space['8'] },
  bottom: { paddingHorizontal: t.size.gutter, gap: t.space['8'], paddingTop: t.space['8'] },
  row: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.space['12'],
    gap: t.space['8'],
    borderWidth: t.space['2'],
    borderColor: t.semantic.bg.raised,
  },
  focused: { borderColor: t.semantic.action.primary },
  name: { flex: 1, minHeight: MIN_TOUCH_TARGET, color: t.semantic.text.primary },
}));

export interface TypeLinesEditorProps {
  readonly lines: readonly TypedLine[];
  readonly currency: string;
  readonly totalMinor: bigint | null;
  readonly focus: string | null;
  readonly whoLabel: (line: TypedLine) => string;
  readonly payerName: string;
  readonly canCommit: boolean;
  readonly committing: boolean;
  readonly onFocus: (lineId: string) => void;
  readonly onLabel: (lineId: string, label: string) => void;
  readonly onKey: (key: KeypadKey) => void;
  readonly onWho: (lineId: string) => void;
  readonly onAddLine: () => void;
  readonly onCommit: () => void;
}

export function TypeLinesEditor(props: TypeLinesEditorProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const inputFont = useInputFont();
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
    <Scaffold variant="dark" testID="money-type-lines">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.top}
        keyboardShouldPersistTaps="handled"
      >
        <BackEyebrow label={upper(t({ id: 'money.typeLines.back', message: 'Receipt' }), locale)} />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'money.typeLines.title', message: 'Type the lines' }), locale)}
        </Text>
        {props.lines.map((line) => {
          const focused = props.focus === line.id;
          return (
            <Pressable
              key={line.id}
              onPress={() => props.onFocus(line.id)}
              testID={`money-typed-${line.id}`}
            >
              <Stack style={[styles.row, focused ? styles.focused : null]}>
                <Row gap="12" align="center">
                  <TextInput
                    value={line.label}
                    onChangeText={(text) => props.onLabel(line.id, text)}
                    onFocus={() => props.onFocus(line.id)}
                    placeholder={t({
                      id: 'money.typeLines.namePlaceholder',
                      message: 'What was it?',
                    })}
                    placeholderTextColor={theme.semantic.text.tertiary}
                    style={[inputFont, styles.name]}
                    accessibilityLabel={t({ id: 'money.typeLines.name', message: 'Line name' })}
                  />
                  <Text variant="rowTitle">
                    {formatAmount(
                      unitsToMinor(line.digits, props.currency),
                      props.currency,
                      locale,
                    )}
                  </Text>
                </Row>
                <TextLink label={props.whoLabel(line)} onPress={() => props.onWho(line.id)} />
              </Stack>
            </Pressable>
          );
        })}
        <TextLink
          label={t({ id: 'money.typeLines.add', message: 'Add a line' })}
          onPress={props.onAddLine}
          testID="money-typed-add"
        />
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + theme.space['8'] }]}>
        <Text
          variant="bodySm"
          color={over ? theme.semantic.state.urgent : theme.semantic.text.secondary}
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
        <Keypad onKey={props.onKey} testID="money-typed-keypad" />
        <PillButton
          label={upper(
            t({ id: 'money.review.commit', message: `Split it · ${payer} paid` }),
            locale,
          )}
          onPress={props.onCommit}
          disabled={!props.canCommit}
          loading={props.committing}
          block
          testID="money-typed-commit"
        />
      </View>
    </Scaffold>
  );
}
