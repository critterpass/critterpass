/**
 * Lab scenes for review changes (3e-3), its states and the chat card's states, over the rain
 * change set through the same model and copy as the app, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Scaffold } from '@/ui/surface/Scaffold';

import { BALI_MEMBERS, WINSTON } from '../../overview/dev/bali-plan';
import { weekdayOf } from '../../overview/day-card';
import { ChangesetChatCardView } from '../changeset-chat-card';
import { buildChangeCards, predictDecider, sideText } from '../model/review-model';
import { reviewNumbers } from '../model/review-numbers';
import {
  backLabel,
  dayNames,
  reviewSummary,
  reviewTitle,
  sendLabel,
  triggerTag,
} from '../review-copy';
import { ReviewView, type ReviewViewProps } from '../review-view';
import { RAIN_BASE_ITEMS, RAIN_DAYS, RAIN_OPS, RAIN_POI_NAMES } from './rain-changeset';

const noop = () => undefined;
const crew = BALI_MEMBERS.map((member) => member.user_id);

function useRainProps(
  ops: typeof RAIN_OPS,
  overrides: (base: ReviewViewProps) => Partial<ReviewViewProps>,
): ReviewViewProps {
  const locale = useLocale();
  const cards = buildChangeCards(ops, RAIN_BASE_ITEMS, RAIN_POI_NAMES, 'Asia/Makassar');
  const numbers = reviewNumbers({ items: RAIN_BASE_ITEMS, ops, crew, currency: 'USD' });
  const prediction = predictDecider({
    ops,
    baseItems: RAIN_BASE_ITEMS,
    crew,
    authorId: WINSTON,
    costDeltaMinor: 2_200,
    inTrip: false,
    now: new Date('2026-10-20T00:00:00Z'),
  });
  const weekday = (date: string | null) => weekdayOf(date, locale);
  const index = new Map<string, { name: string; i: number }>(
    BALI_MEMBERS.map((m, i) => [m.user_id, { name: m.display_name, i }]),
  );
  const base: ReviewViewProps = {
    state: 'ready',
    backLabel: backLabel(cards),
    tag: triggerTag('weather'),
    guide: { id: 'tokek', name: 'Tokek' },
    title: reviewTitle('weather', cards.length),
    summary: reviewSummary({
      byGuide: true,
      guideName: 'Tokek',
      authorName: null,
      days: dayNames(['2026-11-04'], locale),
      mustDosTouched: numbers.mustDosTouched,
    }),
    cards: cards.map((card) => ({
      key: card.target,
      before: card.before && sideText(card.before, RAIN_DAYS, card.movesDay, weekday),
      after: card.after && sideText(card.after, RAIN_DAYS, card.movesDay, weekday),
      reason: card.reason,
      people: card.people.map((uid) => ({
        key: uid,
        name: index.get(uid)?.name ?? '',
        joinIndex: index.get(uid)?.i ?? 0,
      })),
      accepted: card.accepted,
    })),
    onToggle: noop,
    numbers,
    send: {
      label: sendLabel(prediction),
      disabled: cards.every((card) => !card.accepted),
      busy: false,
      onPress: noop,
    },
    personal: { onPress: noop, busy: false },
    vote: null,
    organiserApply: null,
    warnings: { mustDo: false, booking: false },
    notice: null,
    onBack: noop,
  };
  return { ...base, ...overrides(base) };
}

function scene(
  ops: typeof RAIN_OPS,
  overrides: (base: ReviewViewProps) => Partial<ReviewViewProps> = () => ({}),
): () => ReactNode {
  return function Scene() {
    return <ReviewView {...useRainProps(ops, overrides)} />;
  };
}

const dropped = RAIN_OPS.map((op) => ({ ...op, accepted: false }));
const mustDo = RAIN_OPS.map((op, i) =>
  i === 0
    ? { ...op, after: { ...op.after, must_do_id: '0199b000-0000-7000-8000-00000000f001' } }
    : op,
);
const voting = (mine: 'yes' | null) => () => ({
  send: null,
  onToggle: null,
  vote: { yes: 2, needed: 4, mine, canVote: mine === null, onYes: noop, onNo: noop },
});

function ChatCards() {
  const title = reviewTitle('weather', 4);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} testID="plan-chat-cards">
        <ChangesetChatCardView
          title={title}
          state="voting"
          yes={2}
          needed={4}
          onDecide={noop}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="approved"
          yes={4}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="rejected"
          yes={1}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="expired"
          yes={2}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="stale"
          yes={0}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
      </ScrollView>
    </Scaffold>
  );
}

export const REVIEW_SCENES: Readonly<Record<string, () => ReactNode>> = {
  review: scene(RAIN_OPS),
  'review-all-dropped': scene(dropped),
  'review-must-do': scene(mustDo, () => ({ warnings: { mustDo: true, booking: false } })),
  'review-voting': scene(RAIN_OPS, voting(null)),
  'review-voted': scene(RAIN_OPS, voting('yes')),
  'review-stale': scene(RAIN_OPS, () => ({ send: null, onToggle: null, notice: 'stale' })),
  'review-expired': scene(RAIN_OPS, () => ({
    send: null,
    onToggle: null,
    personal: null,
    notice: 'expired',
  })),
  'review-approved': scene(RAIN_OPS, () => ({
    send: null,
    onToggle: null,
    personal: null,
    notice: 'approved',
  })),
  'review-failed': scene(RAIN_OPS, () => ({ notice: 'supplier_refused' })),
  'review-loading': scene(RAIN_OPS, () => ({ state: 'loading' })),
  'review-chat-cards': () => <ChatCards />,
};
