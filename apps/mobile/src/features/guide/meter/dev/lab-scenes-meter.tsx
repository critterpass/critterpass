/**
 * Guide lab scenes for the meter: out of questions (4b-1) as designed (Pon, just me, the refused
 * question, the limit card with Maya's Pass+ hint and the countdown), the 30th answer landing
 * with nothing refused yet, ASK AT MIDNIGHT opening its composer, and the chip on the free,
 * boosted and Pass+ meters.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { Stack, useTheme } from '@/ui';
import { ChatMessage } from '@/ui/chat/ChatMessage';

import { LabSheet, LAB_TRIP, RAIN_ANSWER, RAIN_QUESTION } from '../../chat/dev/lab-scenes-chat';
import type { SavedGuideMessage } from '../../chat/data/use-guide-thread';
import { LimitCard, LimitComposer, QueueComposer } from '../limit-card';
import { MeterChip } from '../meter-chip';

const noop = () => undefined;
const PON = { slug: 'pon', name: 'Pon' };
const KYOTO = { ...LAB_TRIP, destination: 'Kyoto', startDate: '2027-04-02', endDate: '2027-04-09' };
/** 7 h 12 min after the lab's clock. */
const NOW = new Date('2027-04-04T07:48:00Z');
const RESET = '2027-04-04T15:00:00Z';

function PonLimit({
  refused,
  composer,
}: {
  readonly refused: boolean;
  readonly composer?: ReactNode;
}) {
  const theme = useTheme();
  const saved: SavedGuideMessage[] = refused
    ? []
    : [
        {
          id: 'q1',
          role: 'user',
          authorId: null,
          text: 'Where do we eat near Fushimi Inari?',
          proposals: [],
          sources: [],
          rating: null,
          createdAt: '2027-04-04T07:40:00Z',
        },
      ];
  return (
    <LabSheet
      guide={PON}
      mode="private"
      trip={KYOTO}
      quick={false}
      messages={saved}
      footer={
        <Stack gap="16">
          {refused ? <ChatMessage kind="theirs" text="Can we swap Nara for Uji on day 3?" /> : null}
          <LimitCard
            guideName="Pon"
            color={theme.guide.pon}
            used={30}
            limit={30}
            resetAt={RESET}
            destination="Kyoto"
            onGetPass={noop}
            onAskAtMidnight={noop}
            passHolder={refused ? { name: 'Maya', joinIndex: 1 } : null}
            onCrewChat={noop}
          />
        </Stack>
      }
      composer={composer ?? <LimitComposer guideName="Pon" resetAt={RESET} now={NOW} />}
    />
  );
}

const rain: SavedGuideMessage[] = [
  {
    id: 'q1',
    role: 'user',
    authorId: null,
    text: RAIN_QUESTION,
    proposals: [],
    sources: [],
    rating: null,
    createdAt: '2026-10-03T05:00:00Z',
  },
  {
    id: 'a1',
    role: 'guide',
    authorId: null,
    text: RAIN_ANSWER,
    proposals: [],
    sources: [],
    rating: null,
    createdAt: '2026-10-03T05:00:10Z',
  },
];

export const METER_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'limit-refused': () => <PonLimit refused />,
  'limit-thirtieth': () => <PonLimit refused={false} />,
  'limit-writing': () => (
    <PonLimit
      refused={false}
      composer={<QueueComposer guideName="Pon" value="" onChangeText={noop} onSend={noop} />}
    />
  ),
  'meter-free': () => (
    <LabSheet
      messages={rain}
      chip={
        <MeterChip
          meter={{ kind: 'free', used: 12, limit: 30, resetAt: RESET }}
          guideName="Tokek"
        />
      }
    />
  ),
  'meter-boosted': () => (
    <LabSheet
      messages={rain}
      guide={PON}
      chip={<MeterChip meter={{ kind: 'boosted' }} guideName="Pon" />}
    />
  ),
  'meter-unlimited': () => (
    <LabSheet
      messages={rain}
      chip={<MeterChip meter={{ kind: 'unlimited' }} guideName="Tokek" />}
    />
  ),
};
