/**
 * Every proposal lab scene by name, for the (dev) proposal lab and its screenshot flows: the
 * builder (3f-1), your version (3f-3), not sure yet (3f-4), slide to board (3f-5) and who's in
 * (3f-6), each drawn from the pure views with fixed data. Labels, money and dates come from the
 * catalog and the real formatters; only what the server would send is fixture text.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { AloneView } from '../builder/alone-view';
import { BuilderView, type BuilderViewProps } from '../builder/builder-view';
import { DEFAULT_CONFIG } from '../builder/model';
import { ReplyBySheet } from '../builder/reply-by-sheet';
import { SendProgress } from '../builder/send-progress';
import { BoardView, type BoardViewProps } from '../board/board-view';
import { SeatSheet } from '../board/seat-sheet';
import { instantDate, wholeMoney } from '../data/format';
import { answerChip, eachPrice, stopWhen, tripDates, tripLine, versionChip } from '../labels';
import { ObjectionSheetView } from '../objection/objection-sheet';
import { HypeBar } from '../your-version/hype-bar';
import { ShareCard } from '../your-version/share-card';
import { YourVersionView } from '../your-version/your-version-view';
import { Dismissable } from './dismissable';
import { DROPOUT_SCENES } from './lab-scenes-dropout';
import { TRACKER_SCENES } from './lab-scenes-tracker';
import {
  LAB_OBJECTION,
  LAB_GROUP_PICKS,
  LAB_PICKS,
  LAB_RECIPIENTS,
  LAB_SAVINGS,
  LAB_VERSIONS,
  labTag,
} from './lab-fixtures';

const noop = () => undefined;

/** The fixture trip: Đà Nẵng, 2–4 Oct, sent on the 1st with replies due that evening. */
const DESTINATION = 'Đà Nẵng';
const START = '2026-10-02';
const END = '2026-10-04';
const REPLY_BY = '2026-10-01T14:00:00.000Z';
const SHARE_MINOR = 4_200_000;
const CURRENCY = 'VND';

const builder = (locale: string, over: Partial<BuilderViewProps> = {}) => (
  <BuilderView
    locale={locale}
    guideName="Chà Vá"
    guide="chava"
    destination={DESTINATION}
    config={DEFAULT_CONFIG}
    headline="Bà Nà before the crowds."
    price={eachPrice(locale, SHARE_MINOR, CURRENCY)}
    replyByLabel={instantDate(locale, REPLY_BY)}
    stays={[]}
    previews={[
      { uid: 'u-linh', name: 'Linh' },
      { uid: 'u-minh', name: 'Minh' },
    ]}
    recipients={3}
    offline={false}
    blocked={null}
    sending={false}
    onBack={noop}
    onFormat={noop}
    onShowCost={noop}
    onPersonal={noop}
    onReplyBy={noop}
    onPreview={noop}
    onSend={noop}
    {...over}
  />
);

const version = (
  locale: string,
  sheet: ReactNode = null,
  group = false,
  answer: 'in' | null = null,
) => (
  <>
    <YourVersionView
      name="Linh"
      group={group}
      tripLine={tripLine(locale, DESTINATION, START, END)}
      onPlan={noop}
      preview={false}
      guide="chava"
      chip={answer === null ? versionChip(locale, null, REPLY_BY) : answerChip(answer)}
      pending={false}
      fallbackNote={null}
      picks={group ? LAB_GROUP_PICKS : LAB_PICKS}
      when={(pick) => stopWhen(locale, pick)}
      tag={labTag}
      personalised
      organiser="Winston"
      share={
        <ShareCard
          locale={locale}
          baseMinor={SHARE_MINOR}
          currency={CURRENCY}
          savings={LAB_SAVINGS}
          chosen={[]}
          onToggle={noop}
        />
      }
      hype={
        <HypeBar
          hype={{ pct: 67, reacted: 2, boarded: 1, recipients: 3 }}
          latest={{ name: 'Minh', kind: 'six_am' }}
        />
      }
      answer={answer}
      onBack={noop}
      onPick={noop}
      onIn={noop}
      onMaybe={noop}
      onOut={noop}
      onAsk={noop}
    />
    {sheet}
  </>
);

const board = (locale: string, over: Partial<BoardViewProps> = {}) => (
  <BoardView
    guide="chava"
    eyebrow={tripLine(locale, DESTINATION, START, END)}
    name="Linh"
    crewIn={[
      { key: 'u-khanh', name: 'Khanh', joinIndex: 0 },
      { key: 'u-linh', name: 'Linh', joinIndex: 1 },
    ]}
    counter="1/4"
    boarded={false}
    pending={false}
    ticket={{
      from: 'SGN',
      to: 'DAD',
      passenger: 'Linh Nguyen',
      dates: tripDates(locale, START, END),
      share: wholeMoney(locale, SHARE_MINOR, CURRENCY),
      group: 'Proposal Crew',
      seat: 'A02',
    }}
    onBoard={noop}
    onMaybe={noop}
    onOut={noop}
    onBack={noop}
    onDone={noop}
    {...over}
  />
);

/** A scene draws itself in the app's language: the lab passes the active locale. */
export type LabScene = (locale: string) => ReactNode;

export const PROPOSAL_LAB_SCENES: Readonly<Record<string, LabScene>> = {
  build: (locale) => builder(locale),
  'build-alone': (locale) => (
    <AloneView
      guide="chava"
      destination={DESTINATION}
      dates={tripDates(locale, START, END)}
      offline={false}
      locking={false}
      onBack={noop}
      onLock={noop}
      onInvite={noop}
    />
  ),
  'build-reply-by': (locale) => (
    <>
      {builder(locale)}
      <Dismissable>
        {(close) => (
          <ReplyBySheet
            locale={locale}
            choices={[1, 2, 3].map((d) => new Date(Date.UTC(2026, 9, d, 13)))}
            fallback={new Date(Date.UTC(2026, 9, 1, 23))}
            value={null}
            freeCancelUntil={null}
            onPick={noop}
            onClose={close}
          />
        )}
      </Dismissable>
    </>
  ),
  sent: (locale) => (
    <SendProgress
      guide="chava"
      format="trailer"
      destination={DESTINATION}
      headline="Bà Nà before the crowds."
      price={eachPrice(locale, SHARE_MINOR, CURRENCY)}
      guideName="Chà Vá"
      recipients={LAB_RECIPIENTS}
      versions={LAB_VERSIONS}
      onTracker={noop}
    />
  ),
  version: (locale) => version(locale),
  'version-answered': (locale) => version(locale, null, false, 'in'),
  'version-group': (locale) => version(locale, null, true),
  'not-sure': (locale) =>
    version(
      locale,
      <Dismissable>
        {(close) => (
          <ObjectionSheetView
            {...LAB_OBJECTION}
            locale={locale}
            baseMinor={SHARE_MINOR}
            currency={CURRENCY}
            onReason={noop}
            onToggle={noop}
            onAskCrew={noop}
            onLater={noop}
            onBoard={noop}
            onClose={close}
          />
        )}
      </Dismissable>,
    ),
  board: (locale) => board(locale),
  'board-boarded': (locale) => board(locale, { boarded: true, counter: '2/4' }),
  'board-full': (locale) => (
    <>
      {board(locale)}
      <Dismissable>{(close) => <SeatSheet position={1} cap={6} onClose={close} />}</Dismissable>
    </>
  ),
  ...TRACKER_SCENES,
  ...DROPOUT_SCENES,
};

export const PROPOSAL_LAB_SCENE_NAMES: readonly string[] = Object.keys(PROPOSAL_LAB_SCENES);
