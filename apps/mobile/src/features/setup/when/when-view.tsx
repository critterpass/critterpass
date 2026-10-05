/**
 * The dates step (3c-3, 3c-4) as a pure view. With a week the whole crew can make: the heatmap
 * with that week as a yellow band, the guide's reason and "Lock {range}". Without one: "No week
 * fits all {n}" and the options, the guide's pick, a CTA that follows the selection and "Pick a
 * the dates myself". Before anyone has shared a day, while the options are being worked out, or
 * when the only week that fits starts within days, PICK THE DATES is the main button (the picker
 * asks how many days). Everyone sees their own calendar's row; only
 * the organiser gets the lock and ask actions. Only counts are ever shown, never anyone's days.
 */
import { t } from '@lingui/core/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Skeleton } from '@/ui/states/Skeleton';
import type { GuideId } from '@/ui/people/GuideLine';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { SetupMember } from '../data/setup-trip';
import type { ShellFrame } from '../shell/frame';
import { GuideNote } from '../shell/guide-note';
import { WonTag } from '../shell/header-tag';
import { SetupShell } from '../shell/setup-shell';
import { bestReasonLine, countWord, pickReasonLine, rangeLabel } from './copy';
import { Heatmap } from './heatmap';
import type { HeatMonth, WhenMode, WindowOption } from './model';
import { OwnCalendarRow, type OwnCalendar } from './own-calendar-row';
import { checkedLine, syncedLine } from './when-lines';
import { WindowOptions } from './window-options';

export interface WhenModel {
  readonly isOrganiser: boolean;
  readonly mode: WhenMode;
  readonly place: string;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly score: { readonly won: number; readonly next: number } | null;
  readonly members: readonly SetupMember[];
  readonly total: number;
  /** A trip for one (solo, or a crew of one so far): the step speaks to you, not the crew. */
  readonly solo: boolean;
  readonly synced: number;
  /** Names of people who have not shared a day, when the api could say (online). */
  readonly unsyncedNames: readonly string[];
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly best: WindowOption | null;
  readonly options: readonly WindowOption[];
  readonly selectedId: string | null;
  readonly mustDoTitles: ReadonlyMap<string, string>;
  readonly calendar: OwnCalendar;
  readonly now: Date;
  /** Today on this phone (`YYYY-MM-DD`), for the calendar's "Today" link. */
  readonly today?: string | undefined;
  /** A lock or ask in flight, and the last one's failure line. */
  readonly busy: boolean;
  readonly failure: WhenFailure | null;
}

/** Why the last lock or ask failed: no signal, too many tries, or anything else. */
export type WhenFailure = 'offline' | 'rate' | 'generic';

export function failureLine(failure: WhenFailure): string {
  switch (failure) {
    case 'offline':
      return t({
        id: 'setup.when.fail.offline',
        message: 'Locking needs signal. Try again in a moment.',
      });
    case 'rate':
      return t({ id: 'setup.when.fail.rate', message: 'Too many tries. Give it a few minutes.' });
    case 'generic':
      return t({ id: 'setup.when.fail.generic', message: 'That didn’t go through. Try again.' });
  }
}

export interface WhenActions {
  readonly onSelect: (id: string) => void;
  readonly onLock: (start: string, end: string) => void;
  readonly onAsk: (option: WindowOption) => void;
  readonly onPickWeek: () => void;
  readonly onConnect: () => void;
  readonly onMarkByHand: () => void;
}

export function WhenView({
  shell,
  model,
  actions,
}: {
  readonly shell: ShellFrame;
  readonly model: WhenModel;
  readonly actions: WhenActions;
}) {
  const locale = useLocale();
  const theme = useTheme();
  const tag =
    model.score === null ? undefined : (
      <WonTag destination={model.place} won={model.score.won} next={model.score.next} />
    );
  const own = (
    <OwnCalendarRow
      calendar={model.calendar}
      now={model.now}
      onConnect={actions.onConnect}
      onMarkByHand={actions.onMarkByHand}
    />
  );
  const failure =
    model.failure === null ? null : (
      <Text variant="bodySm" color={theme.semantic.state.urgent} testID="when-failure">
        {failureLine(model.failure)}
      </Text>
    );

  if (model.mode === 'no_fit') {
    const selected = model.options.find((option) => option.id === model.selectedId);
    const pick = model.options.find((option) => option.isPick);
    const total = countWord(model.total);
    let cta: string | null = null;
    if (selected?.kind === 'ask_first' && selected.askState === null) {
      const name = model.members.find((member) => member.uid === selected.askUserId)?.name ?? '';
      cta = t({ id: 'setup.when.cta.ask', message: `Ask ${name}` });
    } else if (selected !== undefined && selected.kind !== 'ask_first') {
      const range = rangeLabel(locale, selected.start, selected.end);
      cta = t({ id: 'setup.when.cta.lock', message: `Lock ${range}` });
    }
    return (
      <SetupShell
        {...shell}
        tag={tag}
        title={t({ id: 'setup.when.noFit.title', message: `No week fits all ${total}` })}
        line={checkedLine(model, locale)}
        testID="setup-when-no-fit"
        footer={
          model.isOrganiser ? (
            <>
              {cta === null || selected === undefined ? null : (
                <PillButton
                  label={cta}
                  flap
                  loading={model.busy}
                  onPress={() =>
                    selected.kind === 'ask_first'
                      ? actions.onAsk(selected)
                      : actions.onLock(selected.start, selected.end)
                  }
                  testID="when-cta"
                />
              )}
              <TextLink
                label={t({ id: 'setup.when.pickMyself', message: 'Pick the dates myself' })}
                onPress={actions.onPickWeek}
                testID="when-pick-week"
              />
            </>
          ) : undefined
        }
      >
        <WindowOptions
          options={model.options}
          selectedId={model.selectedId}
          onSelect={model.isOrganiser ? actions.onSelect : () => undefined}
          people={{
            members: model.members,
            guideName: model.guideName,
            place: model.place,
            mustDoTitles: model.mustDoTitles,
          }}
        />
        <GuideNote guide={model.guide} line={pickReasonLine(pick)} note />
        {failure}
        {own}
      </SetupShell>
    );
  }

  const best = model.best;
  const range = best === null ? null : rangeLabel(locale, best.start, best.end);
  // The pill counts in numerals, as the render does ("all 6 free").
  const everyone = model.total;
  return (
    <SetupShell
      {...shell}
      tag={tag}
      title={
        model.solo
          ? t({ id: 'setup.when.titleSolo', message: 'When can you go?' })
          : t({ id: 'setup.when.title', message: 'When can everyone go?' })
      }
      line={syncedLine(model)}
      testID={`setup-when-${model.mode}`}
      footer={
        !model.isOrganiser ? undefined : best !== null && range !== null ? (
          <>
            <PillButton
              label={t({ id: 'setup.when.cta.lock', message: `Lock ${range}` })}
              flap
              loading={model.busy}
              onPress={() => actions.onLock(best.start, best.end)}
              testID="when-cta"
            />
            <TextLink
              label={t({ id: 'setup.when.pickOtherDays', message: 'Pick other days' })}
              onPress={actions.onPickWeek}
              testID="when-pick-week"
            />
          </>
        ) : (
          // Nothing to suggest (nobody has shared a day, the windows are being worked out, or the
          // only one starts within days): picking the dates is the step's main action.
          <PillButton
            label={t({ id: 'setup.when.pickDates', message: 'Pick the dates' })}
            onPress={actions.onPickWeek}
            testID="when-pick-week"
          />
        )
      }
    >
      {model.months.length > 0 ? (
        <Heatmap
          months={model.months}
          startIndex={model.startMonth}
          total={model.total}
          window={best === null ? null : { start: best.start, end: best.end }}
          today={model.today}
          windowLabel={
            range === null
              ? undefined
              : model.solo
                ? t({ id: 'setup.when.windowPillSolo', message: `${range} · you're free` })
                : t({ id: 'setup.when.windowPill', message: `${range} · all ${everyone} free` })
          }
        />
      ) : null}
      {best !== null ? (
        <GuideNote guide={model.guide} line={bestReasonLine(best, model.place, model.solo)} />
      ) : null}
      {model.mode === 'computing' ? (
        <Skeleton
          preset="list"
          label={t({ id: 'setup.when.computing', message: 'Finding the best week' })}
        />
      ) : null}
      {failure}
      {own}
    </SetupShell>
  );
}
