/**
 * Lab scenes for the recap story (3m-3…3m-8), one per card over the Đà Nẵng fixtures: each scene
 * starts the story on its card and holds it once the card's choreography has played, so a capture
 * shows the card settled; the signature sheet and the MVP vote open over the stamp and the awards.
 * The cards come from the story's own builder; signatures show as names (no stroke is fetched).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { tokens } from '@cp/design-tokens';
import type { RecapCard } from '@cp/domain';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';

import { readAward, readRecap } from '../data/recap-rows';
import { SignatureSheet } from '../signature/signature-sheet';
import { MvpSheet } from '../story/mvp-sheet';
import { buildStoryCards } from '../story/story-cards';
import { storySubtitle, themeName } from '../story/story-copy';
import { StoryFooter } from '../story/story-footer';
import { storySummary } from '../story/story-summary';
import { StoryView } from '../story/story-view';
import type { StoryData } from '../story/use-story-data';
import {
  ALEX,
  awardRows,
  CARDS,
  CREW,
  FORM_ROWS,
  JORDAN,
  MAYA,
  ME,
  recapRow,
  TRIP,
} from './recap-fixtures';

const noop = () => undefined;
/** Long enough for every card's choreography; short of its six seconds. */
const SETTLE_MS = 4500;

function storyData(): StoryData {
  return {
    loaded: true,
    viewerId: ME,
    tripId: TRIP,
    trip: {
      crew_id: CREW,
      status: 'post_trip',
      is_solo: 0,
      start_date: '2026-10-02',
      end_date: '2026-10-04',
      crew_name: 'The Đà Nẵng Four',
      place: 'Đà Nẵng',
      country: 'VN',
      guide_slug: 'chava',
      guide_name: 'Chà Vá',
    },
    recapId: 'lab-recap',
    recap: readRecap(recapRow({ cards: CARDS })),
    awards: awardRows(ME).flatMap((row) => {
      const award = readAward(row);
      return award === null ? [] : [{ ...award, votes: award.mvp ? 2 : 1 }];
    }),
    travellers: [
      { userId: ME, name: 'Winston', colour: tokens.member.colors[0] ?? tokens.color.yellow },
      { userId: MAYA, name: 'Maya', colour: tokens.member.colors[1] ?? tokens.color.pink },
      { userId: JORDAN, name: 'Jordan', colour: tokens.member.colors[2] ?? tokens.color.blue },
      { userId: ALEX, name: 'Alex', colour: tokens.member.colors[3] ?? tokens.color.green.base },
    ],
    myVote: null,
    completed: false,
    myShareMinor: 174_500,
    stamps: [
      {
        id: 'stamp-13',
        trip_id: TRIP,
        seq_no: 13,
        dates: null,
        iata: 'DAD',
        ink_colour: tokens.guide.chava,
        status: 'stamped',
        place: 'Đà Nẵng',
      },
      {
        id: 'stamp-12',
        trip_id: null,
        seq_no: 12,
        dates: null,
        iata: null,
        ink_colour: tokens.color.blue,
        status: 'stamped',
        place: 'Lisbon',
      },
    ],
    signatures: [ME, MAYA, JORDAN, ALEX].map((signer, index) => ({
      signer_id: signer,
      stroke_media_key: null,
      signed_at: `2026-10-05T0${index}:00:00Z`,
    })),
    foundForms: FORM_ROWS.slice(0, 3),
    gotAwayForms: FORM_ROWS,
    gotAwayWindow: 'lab-window',
    reminderSet: false,
  };
}

function Scene({
  card,
  sheet = null,
}: {
  readonly card: RecapCard;
  readonly sheet?: 'mvp' | 'signature' | null;
}) {
  const locale = useLocale();
  const data = useMemo(() => storyData(), []);
  const summary = useMemo(() => storySummary(data), [data]);
  const cards = useMemo(
    () =>
      buildStoryCards({
        data,
        summary,
        live: { signatures: [], tallies: new Map(), mvp: null },
        guide: 'chava',
        ground: tokens.guide.chava,
        locale,
        unit: 'metric',
        loadStroke: () => Promise.resolve(null),
      }),
    [data, summary, locale],
  );
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  const index = Math.max(
    0,
    cards.findIndex((spec) => spec.card === card),
  );
  const [dismissed, setDismissed] = useState(false);
  const open = settled && !dismissed ? sheet : null;
  const closeSheet = () => setDismissed(true);
  return (
    <>
      <StoryView
        guide="chava"
        guideName="Chà Vá"
        subtitle={storySubtitle('Đà Nẵng', themeName('chava'))}
        cards={cards}
        voiceOn={false}
        onToggleVoice={noop}
        onClose={noop}
        onFinished={noop}
        held={settled}
        initialIndex={index}
        footerFor={(playing) => (
          <StoryFooter
            card={playing}
            canVote
            canRemind
            reminded={false}
            nextWindow="2027-05-01"
            canSign
            onVote={noop}
            onRemind={noop}
            onSign={noop}
          />
        )}
      />
      {settled ? (
        <View
          testID="recap-lab-settled"
          style={{ position: 'absolute', bottom: 0, start: 0, width: 2, height: 2 }}
        />
      ) : null}
      {open === 'mvp' ? (
        <MvpSheet
          choices={data.awards.map((award) => ({
            awardId: award.id,
            name: award.name,
            title: award.title ?? award.kind,
            votes: award.votes,
            mvp: false,
          }))}
          myVote={null}
          closed={false}
          onVote={noop}
          onClose={closeSheet}
        />
      ) : null}
      {open === 'signature' ? (
        <SignatureSheet
          name="Winston"
          onClose={closeSheet}
          onSaved={() => Promise.resolve()}
          upload={() => Promise.resolve(null)}
        />
      ) : null}
    </>
  );
}

export const STORY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3m-3-cover': () => <Scene card="cover" />,
  'recap-critters': () => <Scene card="critters" />,
  '3m-4-route': () => <Scene card="route" />,
  '3m-5-awards': () => <Scene card="awards" />,
  '3m-5-mvp-vote': () => <Scene card="awards" sheet="mvp" />,
  '3m-6-receipt': () => <Scene card="receipt" />,
  '3m-7-got-away': () => <Scene card="got_away" />,
  '3m-8-stamp': () => <Scene card="stamp" />,
  '3m-8-signature': () => <Scene card="stamp" sheet="signature" />,
};
