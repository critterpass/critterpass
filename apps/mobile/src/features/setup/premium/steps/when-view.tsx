/**
 * The dates step in the premium look (4.10 a week everyone can make, 4.14 no week fits, and the
 * locked dates): the checklist pill, the headline, the crew's free days as a heat calendar with
 * the suggested week, the guide's reason, this person's own calendar, and the organiser's foot
 * (Lock the week, ask the one person blocking it, or pick other days). Every read and command is
 * the shared `WhenStep`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, GuideNote, LoadingCritter, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { bestReasonLine, countWord, pickReasonLine, rangeLabel } from '../../when/copy';
import { ownCalendarWords } from '../../when/own-calendar';
import { checkedLine, syncedLine } from '../../when/when-lines';
import { failureLine, type WhenViewProps } from '../../when/when-props';
import { HeatCalendar } from './heat-calendar';
import { OwnCalendarCard } from './own-calendar-card';
import { ChecklistPill, StepHeadline, StepPage } from './step-parts';
import { WindowOptionCard } from './window-option-card';

export function PremiumWhenView({ shell, model, actions }: WhenViewProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const guide = guideSticker(model.guide);
  const subtitle =
    model.score === null
      ? undefined
      : t({
          id: 'setup.premium.when.won',
          message: `${model.place} won ${model.score.won}–${model.score.next}`,
        });
  const own = ownCalendarWords(
    {
      calendar: model.calendar,
      now: model.now,
      onConnect: actions.onConnect,
      onMarkByHand: actions.onMarkByHand,
    },
    locale,
  );
  const ownCard = <OwnCalendarCard own={own} status={model.calendar.status} />;
  const failure =
    model.failure === null ? null : (
      <Text variant="caption" color={theme.color.destructive.helper} testID="when-failure">
        {failureLine(model.failure)}
      </Text>
    );
  const pill = (
    <ChecklistPill
      row="dates"
      done={model.mode === 'locked'}
      trailing={t({ id: 'setup.premium.pill.anyOrder', message: 'Then any order' })}
    />
  );
  const title =
    shell.destination === ''
      ? ''
      : t({ id: 'setup.premium.title', message: `${shell.destination} setup` });

  if (model.loading === true) {
    return (
      <StepPage title={title} subtitle={subtitle} testID="setup-when-loading">
        {pill}
        <LoadingCritter
          label={t({ id: 'setup.when.computing', message: 'Finding the best week' })}
        />
      </StepPage>
    );
  }

  const locked = model.locked ?? null;
  if (model.mode === 'locked' && locked !== null) {
    const range = rangeLabel(locale, locked.start, locked.end);
    return (
      <StepPage
        title={title}
        subtitle={subtitle}
        testID="setup-when-locked"
        footer={
          model.isOrganiser && model.canChange === true ? (
            <>
              {failure}
              <TextButton
                label={t({ id: 'setup.when.locked.change', message: 'Change the dates' })}
                onPress={actions.onPickWeek}
                testID="when-change"
              />
            </>
          ) : undefined
        }
      >
        {pill}
        <StepHeadline
          title={t({ id: 'setup.when.locked.title', message: 'The dates are set' })}
          line={t({ id: 'setup.when.locked.line', message: `You’re going ${range}.` })}
        />
        {model.months.length === 0 ? null : (
          <HeatCalendar
            months={model.months}
            startIndex={model.startMonth}
            total={model.total}
            window={locked}
          />
        )}
      </StepPage>
    );
  }

  if (model.mode === 'no_fit') {
    const selected = model.options.find((option) => option.id === model.selectedId);
    const pick = model.options.find((option) => option.isPick);
    const total = countWord(model.total);
    const people = {
      members: model.members,
      guideName: model.guideName,
      place: model.place,
      mustDoTitles: model.mustDoTitles,
    };
    let cta: string | null = null;
    if (selected?.kind === 'ask_first' && selected.askState === null) {
      const name = model.members.find((member) => member.uid === selected.askUserId)?.name ?? '';
      cta = t({ id: 'setup.when.cta.ask', message: `Ask ${name}` });
    } else if (selected !== undefined && selected.kind !== 'ask_first') {
      const range = rangeLabel(locale, selected.start, selected.end);
      cta = t({ id: 'setup.when.cta.lock', message: `Lock ${range}` });
    }
    return (
      <StepPage
        title={title}
        subtitle={subtitle}
        testID="setup-when-no-fit"
        footer={
          model.isOrganiser ? (
            <>
              {failure}
              {cta === null || selected === undefined ? null : (
                <View style={{ alignSelf: 'stretch' }}>
                  <Button
                    label={cta}
                    loading={model.busy}
                    onPress={() =>
                      selected.kind === 'ask_first'
                        ? actions.onAsk(selected)
                        : actions.onLock(selected.start, selected.end)
                    }
                    testID="when-cta"
                  />
                </View>
              )}
              <TextButton
                label={t({ id: 'setup.when.pickMyself', message: 'Pick the dates myself' })}
                onPress={actions.onPickWeek}
                testID="when-pick-week"
              />
            </>
          ) : undefined
        }
      >
        <StepHeadline
          title={t({ id: 'setup.when.noFit.title', message: `No week fits all ${total}` })}
          line={checkedLine(model, locale)}
        />
        {model.options.map((option) => (
          <WindowOptionCard
            key={option.id}
            option={option}
            people={people}
            guideName={model.guideName}
            pick={
              model.isOrganiser
                ? {
                    selected: option.id === model.selectedId,
                    onSelect: () => actions.onSelect(option.id),
                  }
                : null
            }
          />
        ))}
        <GuideNote name={guide.name} critter={guide.kind} text={pickReasonLine(pick)} />
        {ownCard}
      </StepPage>
    );
  }

  const best = model.best;
  const range = best === null ? null : rangeLabel(locale, best.start, best.end);
  const everyone = model.total;
  return (
    <StepPage
      title={title}
      subtitle={subtitle}
      testID={`setup-when-${model.mode}`}
      footer={
        !model.isOrganiser ? undefined : best !== null && range !== null ? (
          <>
            {failure}
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={t({ id: 'setup.when.cta.lock', message: `Lock ${range}` })}
                loading={model.busy}
                onPress={() => actions.onLock(best.start, best.end)}
                testID="when-cta"
              />
            </View>
            <TextButton
              label={t({ id: 'setup.when.pickOtherDays', message: 'Pick other days' })}
              onPress={actions.onPickWeek}
              testID="when-pick-week"
            />
          </>
        ) : (
          <>
            {failure}
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={t({ id: 'setup.when.pickDates', message: 'Pick the dates' })}
                onPress={actions.onPickWeek}
                testID="when-pick-week"
              />
            </View>
          </>
        )
      }
    >
      {pill}
      <StepHeadline
        title={
          model.solo
            ? t({ id: 'setup.when.titleSolo', message: 'When can you go?' })
            : t({ id: 'setup.when.title', message: 'When can everyone go?' })
        }
        line={syncedLine(model)}
      />
      {own.stale || model.calendar.status !== 'synced' ? ownCard : null}
      {model.months.length === 0 ? null : (
        <HeatCalendar
          months={model.months}
          startIndex={model.startMonth}
          total={model.total}
          window={best === null ? null : { start: best.start, end: best.end }}
          windowLabel={
            range === null
              ? undefined
              : model.solo
                ? t({ id: 'setup.when.windowPillSolo', message: `${range} · you're free` })
                : t({ id: 'setup.when.windowPill', message: `${range} · all ${everyone} free` })
          }
        />
      )}
      {best === null ? null : (
        <GuideNote
          name={guide.name}
          critter={guide.kind}
          text={bestReasonLine(best, model.place, model.solo)}
        />
      )}
      {model.mode === 'computing' ? (
        <LoadingCritter
          label={t({ id: 'setup.when.computing', message: 'Finding the best week' })}
        />
      ) : null}
      {own.stale || model.calendar.status !== 'synced' ? null : ownCard}
    </StepPage>
  );
}
