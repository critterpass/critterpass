/**
 * Add to plan (7f-1) as drawn: ADD TO THE PLAN over the place's name and Tokek's line, the trip's
 * days with a fit dot on each (the chosen day filled in paper), the day header, the block in its
 * day with the nearby place under it, WHY {time} as reason tiles, WHO'S GOING, and at the foot the
 * yellow ADD (SUGGEST for a member) and "Just save it for later".
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { DayChips, ReasonGrid, type DayChip, type Reason } from '@/ui/planning';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['16'], gap: t.space['16'] },
  head: { gap: t.space['4'] },
  section: { gap: t.space['8'] },
  foot: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['8'],
    gap: t.space['8'],
    alignItems: 'center',
  },
}));

export interface AddSheetViewProps {
  readonly name: string;
  readonly line: string;
  readonly days: readonly DayChip[];
  readonly dayNo: number | null;
  readonly onDay: (dayNo: number) => void;
  readonly dayHeader: string;
  readonly block: ReactNode;
  readonly whyTitle: string;
  readonly reasons: readonly Reason[];
  /** "Nowhere fits yet", or the offline note, in place of the reasons. */
  readonly note: string | null;
  readonly who: ReactNode;
  readonly cta: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly onSaveLater: (() => void) | null;
}

export function AddSheetView(props: AddSheetViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Sheet
      header={
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {t({ id: 'plan.add.eyebrow', message: 'ADD TO THE PLAN' })}
        </Text>
      }
      detents={['large']}
      accessibilityLabel={props.name}
      testID="plan-add-sheet"
    >
      <SheetScrollView contentContainerStyle={styles.body} testID="plan-add-scroll">
        <View style={styles.head}>
          <Text variant="h1" testID="plan-add-name">
            {props.name}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {props.line}
          </Text>
        </View>
        <DayChips
          days={props.days}
          selectedDayNo={props.dayNo}
          onSelect={props.onDay}
          selectedFill="paper"
          testID="plan-add-days"
        />
        <View style={styles.section}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary} testID="plan-add-day">
            {props.dayHeader}
          </Text>
          {props.block}
        </View>
        <View style={styles.section}>
          <Text variant="eyebrow" color={theme.semantic.text.secondary}>
            {props.whyTitle}
          </Text>
          {props.note === null ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="plan-add-note">
              {props.note}
            </Text>
          )}
          <ReasonGrid reasons={props.reasons} testID="plan-add-why" />
        </View>
        {props.who}
      </SheetScrollView>
      <View style={styles.foot}>
        <PillButton
          label={props.cta}
          onPress={props.onAdd}
          loading={props.busy}
          disabled={props.disabled}
          block
          testID="plan-add-confirm"
        />
        {props.onSaveLater === null ? null : (
          <TextLink
            label={t({ id: 'plan.add.saveLater', message: 'Just save it for later' })}
            onPress={props.onSaveLater}
            testID="plan-add-save-later"
          />
        )}
      </View>
    </Sheet>
  );
}
