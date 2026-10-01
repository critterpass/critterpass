/**
 * Every proposal lab scene by name, for the (dev) proposal lab and its screenshot flows, in the
 * order the flows visit them: the builder (3f-1), your version (3f-3), not sure yet (3f-4), slide
 * to board (3f-5) and who's in (3f-6), each drawn from the pure views with fixed data.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import { AloneView } from '../builder/alone-view';
import { BuilderView, type BuilderViewProps } from '../builder/builder-view';
import { DEFAULT_CONFIG } from '../builder/model';
import { ReplyBySheet } from '../builder/reply-by-sheet';
import { SendProgress } from '../builder/send-progress';
import { BoardView, type BoardViewProps } from '../board/board-view';
import { SeatSheet } from '../board/seat-sheet';
import { ObjectionSheetView } from '../objection/objection-sheet';
import { ConfirmedCard } from '../tracker/confirmed-card';
import { publicStatus, tally } from '../tracker/model';
import { SuggestionsView } from '../tracker/suggestions';
import { TrackerView } from '../tracker/tracker-view';
import { HypeBar } from '../your-version/hype-bar';
import { ShareCard } from '../your-version/share-card';
import { YourVersionView } from '../your-version/your-version-view';
import {
  LAB_OPTIONS,
  LAB_PEOPLE,
  LAB_GROUP_PICKS,
  LAB_PICKS,
  LAB_RECIPIENTS,
  LAB_SAVINGS,
  LAB_SUGGESTIONS,
  LAB_VERSIONS,
} from './lab-fixtures';

const noop = () => undefined;

/** A sheet scene that really closes, so back on the scene closes the sheet first. */
function Dismissable({ children }: { readonly children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(true);
  return open ? children(() => setOpen(false)) : null;
}
const LOCALE = 'en';

const builder = (over: Partial<BuilderViewProps> = {}) => (
  <BuilderView
    locale={LOCALE}
    guideName="Chà Vá"
    guide="chava"
    destination="Đà Nẵng"
    config={DEFAULT_CONFIG}
    headline="Bà Nà before the crowds."
    price="₫4,200,000 each"
    replyByLabel="Oct 1"
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

const version = (sheet: ReactNode = null, group = false) => (
  <>
    <YourVersionView
      name="Linh"
      group={group}
      tripLine="Đà Nẵng · Oct 2–4"
      onPlan={noop}
      preview={false}
      guide="chava"
      chip="Reply by Oct 1"
      pending={false}
      fallbackNote={null}
      picks={group ? LAB_GROUP_PICKS : LAB_PICKS}
      when={(pick) => `Day ${pick.dayNo ?? 1}`}
      share={
        <ShareCard
          locale={LOCALE}
          baseMinor={4_200_000}
          currency="VND"
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
      answered={null}
      onBack={noop}
      onPick={noop}
      onIn={noop}
      onAsk={noop}
    />
    {sheet}
  </>
);

const board = (over: Partial<BoardViewProps> = {}) => (
  <BoardView
    guide="chava"
    eyebrow="Đà Nẵng · Oct 2–4"
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
      dates: 'Oct 2–4',
      share: '₫4,200,000',
      group: 'Proposal Crew',
      seat: 'A02',
    }}
    onBoard={noop}
    onMaybe={noop}
    onOut={noop}
    onDone={noop}
    {...over}
  />
);

const tracker = (locked: boolean) => (
  <TrackerView
    back="Đà Nẵng proposal"
    chip={locked ? 'Confirmed' : 'Reply by Oct 1'}
    rows={LAB_PEOPLE.map((p) => ({
      uid: p.uid,
      name: p.organiser ? `${p.name} (you)` : p.name,
      joinIndex: p.joinIndex,
      status: publicStatus(p),
      line: p.rsvp === 'in' ? 'Boarded Oct 1, 09:20' : 'Sent Oct 1',
    }))}
    tally={tally(LAB_PEOPLE)}
    confirmed={
      locked ? (
        <ConfirmedCard guide="chava" going={2} tripLine="Đà Nẵng · Oct 2–4" onPlan={noop} />
      ) : null
    }
    suggestions={
      locked ? null : (
        <SuggestionsView rows={LAB_SUGGESTIONS} guide="chava" onAct={noop} onDismiss={noop} />
      )
    }
    lockLabel={locked ? null : 'Lock it in'}
    lockNote={locked ? 'Locked in. The trip is confirmed.' : null}
    locking={false}
    onBack={noop}
    onLock={noop}
  />
);

export const PROPOSAL_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  build: () => builder(),
  'build-alone': () => (
    <AloneView
      guide="chava"
      destination="Đà Nẵng"
      dates="Oct 2–4"
      offline={false}
      locking={false}
      onBack={noop}
      onLock={noop}
      onInvite={noop}
    />
  ),
  'build-reply-by': () => (
    <>
      {builder()}
      <Dismissable>
        {(close) => (
          <ReplyBySheet
            locale={LOCALE}
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
  sent: () => (
    <SendProgress
      guide="chava"
      format="trailer"
      destination="Đà Nẵng"
      headline="Bà Nà before the crowds."
      price="₫4,200,000 each"
      guideName="Chà Vá"
      recipients={LAB_RECIPIENTS}
      versions={LAB_VERSIONS}
      onTracker={noop}
    />
  ),
  version: () => version(),
  'version-group': () => version(null, true),
  'not-sure': () =>
    version(
      <Dismissable>
        {(close) => (
          <ObjectionSheetView
            guide="chava"
            guideName="Chà Vá"
            organiserName="Khanh"
            locale={LOCALE}
            baseMinor={4_200_000}
            currency="VND"
            freeCancelLine={null}
            reason="cost"
            answer={{ threadId: 't1', options: LAB_OPTIONS }}
            chosen={['skip:ba-na']}
            pending={false}
            failed={false}
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
  board: () => board(),
  'board-boarded': () => board({ boarded: true, counter: '2/4' }),
  'board-full': () => (
    <>
      {board()}
      <Dismissable>{(close) => <SeatSheet position={1} cap={6} onClose={close} />}</Dismissable>
    </>
  ),
  tracker: () => tracker(false),
  'tracker-locked': () => tracker(true),
};

export const PROPOSAL_LAB_SCENE_NAMES: readonly string[] = Object.keys(PROPOSAL_LAB_SCENES);
