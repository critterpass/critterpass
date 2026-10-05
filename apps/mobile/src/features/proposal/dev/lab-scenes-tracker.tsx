/**
 * The proposal lab's Who's in scenes (3f-6): the tracker with a crew still answering, locked in,
 * and with the lock sheet up. Fixed data; labels and dates from the catalog and the formatters.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { ProposalConfirm } from '../confirm-sheet';
import {
  lockConfirmLabel,
  lockConsequences,
  lockCopy,
  lockTitle,
  trackerBack,
  trackerChip,
  trackerLine,
  trackerName,
  tripLine,
} from '../labels';
import { ConfirmedCard } from '../tracker/confirmed-card';
import { lockState, publicStatus, tally } from '../tracker/model';
import { SuggestionsView } from '../tracker/suggestions';
import { TrackerView } from '../tracker/tracker-view';
import { Dismissable } from './dismissable';
import { LAB_PEOPLE, LAB_SUGGESTIONS } from './lab-fixtures';

const noop = () => undefined;

const DESTINATION = 'Đà Nẵng';
const START = '2026-10-02';
const END = '2026-10-04';
const SENT_AT = '2026-10-01T02:00:00.000Z';
const REPLY_BY = '2026-10-01T14:00:00.000Z';

const tracker = (locale: string, locked: boolean) => {
  const copy = lockCopy(
    lockState(
      locked ? 'locked' : 'sent',
      LAB_PEOPLE.filter((p) => !p.organiser),
    ),
  );
  return (
    <TrackerView
      back={trackerBack({ destination: DESTINATION })}
      chip={trackerChip(locale, locked, null, REPLY_BY)}
      rows={LAB_PEOPLE.map((p) => ({
        uid: p.uid,
        name: trackerName(p, p.organiser),
        joinIndex: p.joinIndex,
        status: publicStatus(p),
        line: trackerLine(locale, p, SENT_AT),
      }))}
      tally={tally(LAB_PEOPLE)}
      confirmed={
        locked ? (
          <ConfirmedCard
            guide="chava"
            going={tally(LAB_PEOPLE).in}
            tripLine={tripLine(locale, DESTINATION, START, END)}
            onPlan={noop}
          />
        ) : null
      }
      suggestions={
        locked ? null : (
          <SuggestionsView rows={LAB_SUGGESTIONS} guide="chava" onAct={noop} onDismiss={noop} />
        )
      }
      lockLabel={copy.label}
      lockNote={copy.note}
      locking={false}
      onBack={noop}
      onLock={noop}
    />
  );
};

export const TRACKER_SCENES: Readonly<Record<string, (locale: string) => ReactNode>> = {
  tracker: (locale) => tracker(locale, false),
  'tracker-locked': (locale) => tracker(locale, true),
  'tracker-lock-sheet': (locale) => (
    <>
      {tracker(locale, false)}
      <Dismissable>
        {(close) => (
          <ProposalConfirm
            title={lockTitle()}
            consequences={lockConsequences(
              lockState(
                'sent',
                LAB_PEOPLE.filter((p) => !p.organiser),
              ),
            )}
            confirmLabel={lockConfirmLabel()}
            mode="button"
            fit
            onConfirm={close}
            onCancel={close}
            testID="tracker-lock-confirm"
          />
        )}
      </Dismissable>
    </>
  ),
};
