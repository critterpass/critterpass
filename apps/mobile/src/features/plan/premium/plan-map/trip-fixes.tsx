/**
 * The plan check's problems opened in place on the plan sheet (4.43): each open fix is put under
 * its day, so on the whole trip a day's problem tag opens its panel under the row and the ink
 * count chip ("2 to fix · 2 to know") steps through them one day at a time; on one day at half
 * the head's "Rain · fix" chip opens it under the head. Mounted only where the rows or the half
 * sheet show, so the check's cards are read only then.
 */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { useCheckCards } from '../../check/use-check-cards';
import { planMapCopy } from './copy';
import { DayHead, type DayHeadProps } from './day-head';
import { FixPanel, type DayFix } from './fix-panel';
import { TripRows, type TripRowsProps } from './trip-rows';

/** The check's open fixes by day number, and how many things there are to know. */
export function useDayFixes(tripId: string): {
  readonly fixes: ReadonlyMap<number, readonly DayFix[]>;
  readonly know: number;
} {
  const { plan, check, fixes, cards, keep } = useCheckCards(tripId);
  const byDay = new Map<number, DayFix[]>();
  fixes.forEach((issue, index) => {
    const card = cards[index];
    const dayNo = plan.dayRows.find((row) => row.id === issue.day_id)?.day_no;
    if (card === undefined || dayNo === undefined) return;
    byDay.set(dayNo, [...(byDay.get(dayNo) ?? []), { card, onKeep: () => keep(issue) }]);
  });
  return { fixes: byDay, know: check.know.length };
}

const checkHref = (tripId: string) =>
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy.
  ({ pathname: '/[tripId]/check', params: { tripId } }) as const;

export interface TripFixRowsProps extends TripRowsProps {
  readonly tripId: string;
  /** The crew, the dates and the countdown over the title. */
  readonly eyebrow: string;
  /** Share the plan (link, PDF, calendar, driver); none while it is a draft. */
  readonly onShare: (() => void) | null;
}

export function TripFixRows(props: TripFixRowsProps) {
  const { tripId, eyebrow, onShare, ...rows } = props;
  const theme = usePremiumTheme();
  const { fixes, know } = useDayFixes(tripId);
  const [opened, setOpened] = useState<number | null>(null);
  const fixCount = [...fixes.values()].reduce((sum, list) => sum + list.length, 0);
  const days = rows.rows.map((row) => row.dayNo).filter((dayNo) => fixes.has(dayNo));
  const next = () => {
    const at = opened === null ? -1 : days.indexOf(opened);
    setOpened(days[(at + 1) % days.length] ?? null);
  };
  const fixWord = t({
    id: 'plan.premium.trip.toFix',
    message: plural(fixCount, { one: '# to fix', other: '# to fix' }),
  });
  const knowWord = t({
    id: 'plan.premium.trip.toKnow',
    message: plural(know, { one: '# to know', other: '# to know' }),
  });
  const count =
    fixCount === 0 && know === 0
      ? null
      : fixCount === 0
        ? knowWord
        : know === 0
          ? fixWord
          : t({ id: 'plan.premium.trip.fixAndKnow', message: `${fixWord} · ${knowWord}` });
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
        <Text variant="captionMuted" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {eyebrow}
        </Text>
        {onShare === null ? null : (
          <Button
            alignSelf="auto"
            label={planMapCopy.share()}
            variant="control"
            size="small"
            icon="share"
            onPress={onShare}
            testID="trip-share"
          />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
        <Text variant="title" style={{ flex: 1 }} accessibilityRole="header">
          {planMapCopy.wholeTrip()}
        </Text>
        {count === null ? null : (
          <PressableScale
            onPress={days.length === 0 ? () => router.push(checkHref(tripId)) : next}
            accessibilityRole="button"
            testID="trip-fix-count"
            style={{
              height: 28,
              borderRadius: 14,
              paddingHorizontal: theme.space.gap10,
              justifyContent: 'center',
              backgroundColor: theme.color.ink,
            }}
          >
            <Text variant="bannerAction" tone="onInk">
              {count}
            </Text>
          </PressableScale>
        )}
      </View>
      <TripRows
        {...rows}
        fixes={fixes}
        opened={opened}
        onOpened={setOpened}
        onOtherWays={() => router.push(checkHref(tripId))}
      />
    </View>
  );
}

function HalfDayHead(props: DayHeadProps & { readonly tripId: string }) {
  const { tripId, ...head } = props;
  const fixes = useDayFixes(tripId).fixes.get(head.dayNo) ?? [];
  const [open, setOpen] = useState(false);
  const first = fixes[0];
  const kind = first?.card.tags[0]?.label ?? '';
  return (
    <View style={{ gap: 10 }}>
      <DayHead
        {...head}
        problem={
          first === undefined
            ? null
            : {
                label: t({ id: 'plan.premium.fix.chip', message: `${kind} · fix` }),
                onPress: () => setOpen((value) => !value),
              }
        }
      />
      {open && first !== undefined ? (
        <FixPanel fix={first} onOtherWays={() => router.push(checkHref(tripId))} inset={false} />
      ) : null}
    </View>
  );
}

/** The chosen day's head: at half it carries the day's first problem and opens its fix in place. */
export function PlanDayHead(props: DayHeadProps & { readonly tripId: string }) {
  return props.size === 'half' ? <HalfDayHead {...props} /> : <DayHead {...props} />;
}
