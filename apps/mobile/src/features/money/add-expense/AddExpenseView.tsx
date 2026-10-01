/**
 * Add an expense (3i-2): ← MONEY and SCAN INSTEAD, "NEW EXPENSE · BALI SIX", the rolling amount
 * with its live "≈" line, the name/category row, PAID BY, SPLIT (EVENLY / BY SHARE / CUSTOM) with
 * its editor, the keypad and ADD RP 450K. Pure: the screen owns the draft and the command.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { Keypad, type KeypadKey } from '@/ui/inputs/Keypad';
import { Segmented } from '@/ui/inputs/Segmented';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { CATEGORY_ICON, useCategoryLabel } from '../components/category';
import type { MoneyMember } from '../data/context';
import { AmountEntry } from './AmountEntry';
import type { ExpenseDraft, SplitEditorMode } from './draft';
import { PayerPicker } from './PayerPicker';
import { SplitEditorCustom } from './SplitEditorCustom';
import { SplitEditorEvenly, SplitEditorShares } from './SplitEditorShares';

const SHAKE_PT = 6;

const useStyles = makeStyles((t) => ({
  // The render's ~12pt rhythm: with 16 the split control slid under the keypad on a 6.3" iPhone.
  top: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingTop: t.space['8'] },
  bottom: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingTop: t.space['8'] },
  details: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['16'],
    minHeight: MIN_TOUCH_TARGET + t.space['12'],
    gap: t.space['12'],
    alignItems: 'center',
  },
  detailsText: { flex: 1 },
}));

export interface AddExpenseViewProps {
  readonly crewName: string;
  readonly editing: boolean;
  readonly draft: ExpenseDraft;
  readonly members: readonly MoneyMember[];
  readonly approx: string | undefined;
  /** Each member's share in the draft's own currency (the one the amount is typed in). */
  readonly perMember: ReadonlyMap<string, bigint> | null;
  readonly ctaLabel: string;
  readonly ctaDisabled: boolean;
  /** Bumped on each refused ADD: the amount shakes. */
  readonly shake: number;
  readonly submitting: boolean;
  readonly onKey: (key: KeypadKey) => void;
  readonly onPayer: (userId: string) => void;
  readonly onMode: (mode: SplitEditorMode) => void;
  readonly onToggle: (userId: string) => void;
  readonly onStep: (userId: string, delta: 1 | -1) => void;
  readonly onFocus: (userId: string | null) => void;
  readonly onCurrency: () => void;
  readonly onDetails: () => void;
  readonly onScanInstead: () => void;
  readonly onSubmit: () => void;
}

function useShake(count: number) {
  const reduced = useReducedImpactMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (count === 0 || reduced) return;
    const step = tokens.motion.duration.instant / 2;
    x.value = withSequence(
      withTiming(SHAKE_PT, { duration: step }),
      withTiming(-SHAKE_PT, { duration: step }),
      withTiming(SHAKE_PT / 2, { duration: step }),
      withTiming(0, { duration: step }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [count, reduced]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

export function AddExpenseView(props: AddExpenseViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const categoryLabel = useCategoryLabel();
  const shake = useShake(props.shake);
  // EVENLY splits between everyone; tapping EVENLY again shows who is in, to leave someone out.
  const [showWho, setShowWho] = useState(false);
  // BY SHARE and CUSTOM list a row per member under the split control: the page scrolls the
  // control to the top so the rows have the room above the keypad, and back for EVENLY.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const splitY = useRef(0);
  const listing = props.draft.mode !== 'equal';
  // BY SHARE sets each share with − / +, not the keypad: the keypad folds away so the member rows
  // have the room (a short phone showed one row above it), and comes back with "Change amount".
  const [reopened, setReopened] = useState(false);
  const keypadOpen = props.draft.mode !== 'weights' || reopened;
  useEffect(() => {
    scroll.current?.scrollTo({ y: listing ? splitY.current : 0, animated: true });
  }, [listing]);
  const { draft } = props;
  const crew = props.crewName;
  const eyebrow = props.editing
    ? t({ id: 'money.add.editEyebrow', message: `Edit expense · ${crew}` })
    : t({ id: 'money.add.eyebrow', message: `New expense · ${crew}` });
  return (
    <Scaffold variant="dark" testID="money-add">
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.top}
        keyboardShouldPersistTaps="handled"
      >
        <Row justify="space-between" align="center">
          <BackEyebrow label={upper(t({ id: 'money.back', message: 'Money' }), locale)} />
          {props.editing ? null : (
            <HeaderPill
              label={upper(t({ id: 'money.add.scanInstead', message: 'Scan instead' }), locale)}
              icon={<Icon name="camera" size={16} decorative />}
              onPress={props.onScanInstead}
              testID="money-add-scan-instead"
            />
          )}
        </Row>
        <Text variant="eyebrow" style={{ textAlign: 'center' }}>
          {upper(eyebrow, locale)}
        </Text>
        <Animated.View style={shake}>
          <AmountEntry
            digits={draft.digits}
            currency={draft.currency}
            approx={props.approx}
            onCurrency={props.onCurrency}
            testID="money-add-amount"
          />
        </Animated.View>
        <Pressable
          onPress={props.onDetails}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'money.add.detailsA11y', message: 'Name, category and day' })}
          testID="money-add-details-row"
        >
          <Row style={styles.details}>
            <Icon name={CATEGORY_ICON[draft.category]} size={24} decorative />
            <Text
              variant="rowTitle"
              numberOfLines={1}
              style={styles.detailsText}
              color={draft.description === '' ? theme.semantic.text.secondary : undefined}
            >
              {draft.description === ''
                ? t({ id: 'money.add.detailsTitle', message: 'What was it?' })
                : draft.description}
            </Text>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {upper(categoryLabel(draft.category), locale)}
            </Text>
          </Row>
        </Pressable>
        <PayerPicker members={props.members} payerId={draft.payerId} onPick={props.onPayer} />
        <View
          onLayout={(event) => {
            splitY.current = event.nativeEvent.layout.y;
            // Opened already listing (an edit, a split by share): start there, without the glide.
            if (listing) scroll.current?.scrollTo({ y: splitY.current, animated: false });
          }}
        >
          <Segmented<SplitEditorMode>
            selectedTone="yellow"
            label={upper(t({ id: 'money.add.split', message: 'Split' }), locale)}
            value={draft.mode}
            onChange={(mode) => {
              setReopened(false);
              if (mode === 'equal' && draft.mode === 'equal') setShowWho((shown) => !shown);
              else props.onMode(mode);
            }}
            segments={[
              {
                value: 'equal',
                label: upper(t({ id: 'money.add.evenly', message: 'Evenly' }), locale),
              },
              {
                value: 'weights',
                label: upper(t({ id: 'money.add.byShare', message: 'By share' }), locale),
              },
              {
                value: 'fixed',
                label: upper(t({ id: 'money.add.custom', message: 'Custom' }), locale),
              },
            ]}
            testID="money-add-split"
          />
        </View>
        {draft.mode === 'equal' ? (
          showWho || draft.included.length < draft.memberIds.length ? (
            <SplitEditorEvenly members={props.members} draft={draft} onToggle={props.onToggle} />
          ) : null
        ) : draft.mode === 'weights' ? (
          <SplitEditorShares
            members={props.members}
            draft={draft}
            perMember={props.perMember}
            currency={draft.currency}
            onStep={props.onStep}
          />
        ) : (
          <SplitEditorCustom members={props.members} draft={draft} onFocus={props.onFocus} />
        )}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + theme.space['8'] }]}>
        {keypadOpen ? (
          <Keypad onKey={props.onKey} testID="money-add-keypad" />
        ) : (
          <PillButton
            label={t({ id: 'money.add.changeAmount', message: 'Change amount' })}
            onPress={() => setReopened(true)}
            variant="secondary"
            block
            testID="money-add-keypad-open"
          />
        )}
        <PillButton
          label={props.ctaLabel}
          onPress={props.onSubmit}
          disabled={props.ctaDisabled}
          loading={props.submitting}
          block
          testID="money-add-submit"
        />
      </View>
    </Scaffold>
  );
}
