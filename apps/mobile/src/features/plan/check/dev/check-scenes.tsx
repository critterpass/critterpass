/**
 * Lab scenes for the plan check and its fixers (7h-1 … 7h-5) over the Bali week, from the views
 * and their own words: the check for an organiser and for a member (with an organiser's private
 * ask on top), the check running and all clear, a too-far card opened, less driving and its no
 * shorter order, rain and crowds, fill a gap, and balance the crew before and after the ask.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { tokens } from '@cp/design-tokens';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { AskCard } from '../ask-card';
import * as words from '../check-copy';
import { CheckView } from '../check-view';
import { compactMoney, currencyDigits, dayTag, driveTitle } from '../format';
import { wasLabel } from '../less-driving/less-driving-screen';
import { LessDrivingView } from '../less-driving/less-driving-view';
import { GapView } from '../fill-gap/gap-view';
import * as gap from '../fill-gap/gap-copy';
import { RainView } from '../rain-crowds/rain-view';
import {
  allSwapsLabel,
  rainTitle,
  reasonLine,
  recheckChip,
  sourceLine,
  spokenHour,
} from '../rain-crowds/rain-copy';
import * as balance from '../balance/balance-copy';
import { BalanceView } from '../balance/balance-view';
import * as lab from './check-lab-copy';
import { CheckLive } from './check-live';

const noop = () => undefined;

function Check({
  member = false,
  state = 'ready',
}: {
  member?: boolean;
  state?: 'ready' | 'running' | 'clear' | 'open';
}) {
  const locale = useLocale();
  const v = lab.issues(locale);
  const cards = state === 'clear' || state === 'running' ? [] : v.cards(member, state === 'open');
  return (
    <CheckView
      backLabel={words.backTripLabel()}
      onBack={noop}
      status={state === 'running' ? words.checkingLabel() : lab.checkedNow()}
      state="ready"
      title={
        state === 'running'
          ? words.checkingTitle()
          : words.checkTitle(cards.length, state === 'clear' ? 0 : 2)
      }
      body={words.checkBody(8)}
      notice={
        state === 'running' ? words.runningNotice() : state === 'clear' ? words.clearNotice() : null
      }
      cards={cards}
      know={state === 'clear' || state === 'running' ? [] : v.know}
      ask={
        member ? (
          <AskCard
            asker="Winston"
            places={['Seniman Coffee', 'Gianyar Night Market']}
            onYes={noop}
            onNo={noop}
          />
        ) : null
      }
      balance={
        member || state !== 'ready' ? null : { label: words.balanceRowLabel(), onPress: noop }
      }
      fixAll={
        cards.length === 0 ? null : { label: words.fixAllLabel(3), busy: false, onPress: noop }
      }
      reducedMotion={false}
    />
  );
}

function LessDriving({ none = false }: { none?: boolean }) {
  const stops = lab.TUESDAY_STOPS;
  const order = [0, 1, 4, 2, 3];
  return (
    <LessDrivingView
      backLabel={dayTag('2026-10-13')}
      onBack={noop}
      state={none ? 'none' : 'ready'}
      before={driveTitle(130)}
      after={driveTitle(65)}
      beforeStops={stops.map((stop) => stop.point)}
      afterStops={order.flatMap((index) => {
        const stop = stops[index];
        return stop === undefined ? [] : [stop.point];
      })}
      stay={lab.VILLA}
      rows={[
        { key: 'cook', time: '09:00', name: 'Cooking class · Paon Bali', booked: true, was: null },
        {
          key: 'forest',
          time: '14:30',
          name: 'Monkey Forest',
          booked: false,
          was: wasLabel(2, '12:00', false),
        },
        {
          key: 'market',
          time: '16:15',
          name: 'Ubud Market',
          booked: false,
          was: wasLabel(4, '', true),
        },
        {
          key: 'saraswati',
          time: '17:30',
          name: 'Taman Saraswati',
          booked: false,
          was: wasLabel(5, '', true),
        },
        {
          key: 'dinner',
          time: '19:00',
          name: 'Dinner · Warung Pondok',
          booked: false,
          was: wasLabel(3, '', true),
        },
      ]}
      primary={{ label: lab.orderLabel(), busy: false, onPress: noop }}
      send={noop}
      reducedMotion={false}
    />
  );
}

function Rain() {
  const locale = useLocale();
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      const pair = key === 'jatiluwih' ? [key] : ['ridge', 'spa'];
      for (const id of pair) {
        if (current.has(key)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const reason = (code: string) =>
    reasonLine(code, { busyFrom: '10:00', rainFrom: '13:00', rainTo: '15:00' });
  const rows = [
    {
      key: 'jatiluwih',
      name: 'Jatiluwih',
      color: tokens.color.blue,
      from: '09:00',
      to: '07:00',
      why: reason('quiet_before'),
    },
    {
      key: 'ridge',
      name: 'Ridge walk',
      color: tokens.color.green.base,
      from: '14:00',
      to: '16:30',
      why: reason('dry_after'),
    },
    {
      key: 'spa',
      name: 'Karsa Spa',
      color: tokens.color.pink,
      from: '16:00',
      to: '14:00',
      why: reason('indoors_in_rain'),
    },
  ].map((row) => ({ ...row, ticked: !unticked.has(row.key) }));
  return (
    <RainView
      backLabel={dayTag('2026-10-14')}
      onBack={noop}
      chip={recheckChip('2026-10-11', locale)}
      title={rainTitle(spokenHour('13:00', locale), spokenHour('10:00', locale))}
      source={sourceLine({ month: lab.october(locale), rain: 'normals', crowds: 'editorial' })}
      state="ready"
      chart={lab.chart(unticked)}
      rows={rows}
      onToggle={toggle}
      primary={{
        label: allSwapsLabel(rows.filter((row) => row.ticked).length, true),
        busy: false,
        onPress: noop,
      }}
      send={noop}
    />
  );
}

function Gap() {
  const locale = useLocale();
  const [picked, setPicked] = useState('0');
  const names = [['Seniman Coffee', 'Art market'], ['Arma Museum'], []] as const;
  return (
    <GapView
      window={gap.windowLabel(dayTag('2026-10-14'), '16:00', '19:00')}
      title={gap.freeTitle(4)}
      free={lab.FOUR}
      context={`${gap.busyLine(gap.andNames(['Maya', 'Rin']), 'Karsa Spa', '18:00')} ${gap.nextLine('Dinner', '19:30')}`}
      eyebrow={gap.ideasEyebrow(3)}
      state="ready"
      empty={gap.noIdeas()}
      ideas={[
        {
          key: '0',
          title: gap.pairTitle('Seniman Coffee', 'Art market'),
          body: `Seniman Coffee, ${gap.saveOf('Dev')}. ${gap.closesLine('Art market', '18:00')}`,
          tags: [
            gap.minutesChip(12),
            gap.eachChip(compactMoney(60_000 * 10 ** currencyDigits('IDR', locale), 'IDR', locale)),
            gap.saveOf('Dev').toUpperCase(),
          ],
        },
        {
          key: '1',
          title: 'Arma Museum',
          body: lab.museumLine(),
          tags: [
            gap.minutesChip(15),
            compactMoney(100_000 * 10 ** currencyDigits('IDR', locale), 'IDR', locale),
          ],
        },
        { key: '2', title: gap.stayTitle(), body: gap.stayBody('Jordan'), tags: [gap.freeChip()] },
      ]}
      picked={picked}
      onPick={setPicked}
      add={{ label: gap.addLabel([...(names[Number(picked)] ?? [])]), busy: false, onPress: noop }}
      elseLabel={gap.somethingElse()}
      onElse={noop}
    />
  );
}

function Balance({ asked = false }: { asked?: boolean }) {
  return (
    <BalanceView
      backLabel={words.backTripLabel()}
      onBack={noop}
      onlyYou={balance.onlyYouLabel()}
      title={balance.balanceTitle()}
      summary={balance.balanceSummary(true, false)}
      loading={false}
      rows={lab.CREW.map((member) => ({
        key: member.name,
        name: member.you ? balance.youName(member.name) : member.name,
        joinIndex: member.joinIndex,
        mustDo: balance.mustDoLine(member.mustDo, true),
        saved: member.saved,
        placed: member.placed,
        count: balance.savesIn(member.placed, member.saved),
      }))}
      offer={{
        line: balance.zeroLine('Dev', 3, 2),
        joinIndex: 5,
        initialName: 'Dev',
        places: [
          { key: 'coffee', name: 'Seniman Coffee', when: lab.when('2026-10-14', '16:00') },
          { key: 'market', name: 'Gianyar Night Market', when: lab.when('2026-10-16', '19:00') },
        ],
        add: { label: balance.addThemLabel(2), busy: false, onPress: noop },
        ask: {
          label: asked ? balance.askedLabel() : balance.askLabel('Dev'),
          busy: false,
          onPress: asked ? null : noop,
        },
        status: asked ? balance.waitingLine('Dev') : null,
      }}
    />
  );
}

export const CHECK_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'check-7h-1': () => <Check />,
  'check-7h-1-member': () => <Check member />,
  'check-7h-1-too-far': () => <Check state="open" />,
  'check-7h-1-running': () => <Check state="running" />,
  'check-7h-1-clear': () => <Check state="clear" />,
  'check-7h-2': () => <Gap />,
  'check-7h-3': () => <LessDriving />,
  'check-7h-3-none': () => <LessDriving none />,
  'check-7h-4': () => <Rain />,
  'check-7h-5': () => <Balance />,
  'check-7h-5-asked': () => <Balance asked />,
  'check-live': () => <CheckLive />,
};
