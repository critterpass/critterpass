/**
 * Ideas (7f-2) as drawn: ← TRIP and ◎ MAP, IDEAS over how many saved places aren't in a day yet,
 * DROP ON A DAY with the trip's days (dashed while a row is lifted, the one under it glowing, each
 * dotted by the lifted idea's fit), the yellow PLACE THEM FOR ME card with Tokek, and the rows.
 * Empty, it says how places get here and offers the way to search (undesigned: built from the
 * kit's note and button).
 */
import { useLingui } from '@lingui/react/macro';
import type { ComponentRef, ReactNode, Ref } from 'react';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { PressScale } from '@/ui/press/PressScale';
import { DayChips, TokekNote, type DayChip } from '@/ui/planning';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlanGuideSticker, usePlanGuide } from '../plan-guide';

const ARROW = '→';

const useStyles = makeStyles((t) => ({
  scroll: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  map: {
    paddingHorizontal: t.space['16'],
    paddingVertical: t.space['8'],
    borderRadius: t.radius.xl,
    backgroundColor: t.semantic.bg.raised,
  },
  head: { gap: t.space['8'] },
  section: { gap: t.space['8'] },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    padding: t.space['16'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.action.primary,
  },
  placeBody: { flex: 1, minWidth: 0, gap: t.space['2'] },
  list: { borderRadius: t.radius.lg, backgroundColor: t.semantic.bg.raised },
}));

export interface IdeasViewProps {
  readonly body: string;
  readonly days: readonly DayChip[];
  readonly dropTarget: { readonly overDayNo: number | null } | undefined;
  readonly chipsRef: Ref<ComponentRef<typeof View>>;
  readonly place: {
    readonly line: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly empty: {
    readonly line: string;
    readonly guide: string;
    /** A way to go and save something, when search is reachable. */
    readonly find: { readonly label: string; readonly onPress: () => void } | null;
  } | null;
  readonly rows: ReactNode;
  readonly scrolls: boolean;
  readonly onBack: () => void;
  readonly onMap: (() => void) | null;
}

export function IdeasView({ chipsRef, ...props }: IdeasViewProps) {
  const guide = usePlanGuide();
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <Scaffold testID="plan-ideas">
      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={props.scrolls}>
        <View style={styles.top}>
          <PressScale
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'plan.ideas.back.a11y', message: 'Back to the trip' })}
            onPress={props.onBack}
            testID="plan-ideas-back"
          >
            <Text variant="eyebrow" color={theme.semantic.text.secondary}>
              {t({ id: 'plan.ideas.back', message: '← TRIP' })}
            </Text>
          </PressScale>
          {props.onMap === null ? null : (
            <PressScale
              widthClass="narrow"
              accessibilityRole="button"
              accessibilityLabel={t({ id: 'plan.ideas.map.a11y', message: 'Ideas on the map' })}
              onPress={props.onMap}
              testID="plan-ideas-map"
            >
              <View style={styles.map}>
                <Text variant="label">{t({ id: 'plan.ideas.map', message: '◎ MAP' })}</Text>
              </View>
            </PressScale>
          )}
        </View>
        <View style={styles.head}>
          <Text variant="displayXl">{t({ id: 'plan.ideas.title', message: 'IDEAS' })}</Text>
          <Text variant="body" color={theme.semantic.text.secondary} testID="plan-ideas-body">
            {props.body}
          </Text>
        </View>
        {props.empty === null ? (
          <>
            <View style={styles.section}>
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {t({ id: 'plan.ideas.dropOnADay', message: 'DROP ON A DAY' })}
              </Text>
              <View ref={chipsRef} collapsable={false}>
                <DayChips
                  days={props.days}
                  dropTarget={props.dropTarget}
                  testID="plan-ideas-days"
                />
              </View>
            </View>
            {props.place === null ? null : (
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'plan.ideas.placeThem.a11y',
                  message: 'Place them for me',
                })}
                accessibilityHint={props.place.line}
                onPress={props.place.onPress}
                disabled={props.place.busy}
                testID="plan-ideas-place"
              >
                <View style={styles.place}>
                  <PlanGuideSticker size={44} />
                  <View style={styles.placeBody}>
                    <Text variant="title" color={theme.semantic.text.onAccent}>
                      {t({ id: 'plan.ideas.placeThem', message: 'PLACE THEM FOR ME' })}
                    </Text>
                    <Text variant="bodySm" color={theme.semantic.text.onAccent}>
                      {props.place.line}
                    </Text>
                  </View>
                  <Text variant="h3" color={theme.semantic.text.onAccent}>
                    {ARROW}
                  </Text>
                </View>
              </PressScale>
            )}
            <View style={styles.list} testID="plan-ideas-list">
              {props.rows}
            </View>
          </>
        ) : (
          <>
            <TokekNote
              guide={guide.id}
              name={props.empty.guide}
              line={props.empty.line}
              testID="plan-ideas-empty"
            />
            {props.empty.find === null ? null : (
              <PillButton
                label={props.empty.find.label}
                onPress={props.empty.find.onPress}
                block
                testID="plan-ideas-find"
              />
            )}
          </>
        )}
      </ScrollView>
    </Scaffold>
  );
}
