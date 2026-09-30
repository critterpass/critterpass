/**
 * Guide lab scenes for the guide sheet (3j-1) and its designed-in-code states, over the Bali Six
 * rainy-afternoon fixtures, with every handler a no-op: group mode with a plan card, the empty
 * thread, thinking, streaming, a slow tool, a web answer with sources, the answer actions, a
 * failed turn, a refusal, the safety card and questions waiting offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { useTheme } from '@/ui';

import { GuideConversation } from '../components/guide-conversation';
import { GuideHeader, useModeLine } from '../components/guide-header';
import { useQuickLabels } from '../components/guide-sheet';
import { PlanCardView } from '../components/plan-card';
import { GuideSheetView, type QuickAction } from '../components/guide-sheet-view';
import type { PlanCardModel } from '../data/use-plan-card';
import type { GuideTripContext } from '../data/use-guide-context';
import type { SavedGuideMessage } from '../data/use-guide-thread';
import type { LiveTurn } from '../data/use-guide-turn';
import { THINKING, type TurnState } from '../data/turn-state';

const noop = () => undefined;

export const LAB_ME = '0192f000-0000-7000-8000-0000000000a1';
export const LAB_NAMES = new Map([
  [LAB_ME, { name: 'Maya', joinIndex: 0 }],
  ['me', { name: 'Maya', joinIndex: 0 }],
]);

export const LAB_PLAN: PlanCardModel = {
  changesetId: '0192f000-0000-7000-8000-00000000c5e1',
  tripId: '0192f000-0000-7000-8000-00000000b001',
  status: 'draft',
  costDeltaMinor: 13_200,
  currency: 'USD',
  tz: 'Asia/Makassar',
  swaps: [
    {
      target: 'a',
      op: 'swap',
      before: { label: 'Campuhan Ridge walk', startsAt: '2026-10-03T06:00:00Z' },
      after: { label: 'Cooking class, Paon', startsAt: '2026-10-03T06:00:00Z' },
      reason: 'Indoors · 4 seats open · book in the plan',
    },
    {
      target: 'b',
      op: 'swap',
      before: { label: 'Monkey Forest', startsAt: '2026-10-03T08:30:00Z' },
      after: { label: 'Puri Lukisan Museum', startsAt: '2026-10-03T08:30:00Z' },
      reason: '10 min walk from Paon · covered garden',
    },
  ],
};

export const RAIN_QUESTION = "It's pouring in Ubud. What now?";
export const RAIN_ANSWER =
  "Rain till about three. Here's a dry afternoon that still gets you to dinner at 19:30.";

const question = (id: string, text: string): SavedGuideMessage => ({
  id,
  role: 'user',
  authorId: LAB_ME,
  text,
  proposals: [],
  sources: [],
  rating: null,
  createdAt: '2026-10-03T05:00:00Z',
});

const answer = (id: string, text: string, extra: Partial<SavedGuideMessage> = {}) => ({
  ...question(id, text),
  role: 'guide' as const,
  authorId: null,
  ...extra,
});

function live(state: Partial<TurnState>, text = RAIN_QUESTION): LiveTurn {
  return { key: 1, question: text, state: { ...THINKING, ...state } };
}

export const LAB_TRIP: GuideTripContext = {
  tripId: LAB_PLAN.tripId,
  crewId: '0192f000-0000-7000-8000-00000000c1e0',
  destination: 'Bali',
  startDate: '2026-10-01',
  endDate: '2026-10-07',
  crewSize: 6,
};

export function useLabQuickActions(): QuickAction[] {
  const labels = useQuickLabels();
  return (['call_car', 'translate_menu', 'pharmacy'] as const).map((id) => ({
    id,
    label: labels[id],
    onPress: noop,
  }));
}

export interface LabSheetOptions {
  readonly mode?: 'group' | 'private';
  readonly guide?: { slug: string; name: string };
  readonly messages?: readonly SavedGuideMessage[];
  readonly live?: LiveTurn | null;
  readonly waiting?: readonly string[];
  readonly chip?: ReactNode;
  readonly footer?: ReactNode;
  readonly composer?: ReactNode;
  readonly quick?: boolean;
  readonly proposal?: PlanCardModel;
  readonly trip?: GuideTripContext;
}

export function LabSheet(options: LabSheetOptions) {
  const theme = useTheme();
  const guide = options.guide ?? { slug: 'tokek', name: 'Tokek' };
  const color = theme.guide[guide.slug as 'tokek'];
  const quick = useLabQuickActions();
  const mode = options.mode ?? 'group';
  const modeLine = useModeLine(mode, options.trip ?? LAB_TRIP);
  return (
    <GuideSheetView
      header={
        <GuideHeader
          guideSlug={guide.slug}
          guideName={guide.name}
          modeLine={modeLine}
          mode={mode}
          {...(options.mode === 'private' ? {} : { onMode: noop })}
          meter={options.chip}
        />
      }
      conversation={
        <GuideConversation
          guideName={guide.name}
          color={color}
          hasTrip
          messages={options.messages ?? []}
          names={LAB_NAMES}
          live={options.live ?? null}
          waiting={options.waiting ?? []}
          renderProposal={() => (
            <PlanCardView
              model={options.proposal ?? LAB_PLAN}
              canPropose
              onPropose={noop}
              onJustMe={noop}
              onReview={noop}
            />
          )}
          onPrompt={noop}
          onRetry={noop}
          onRate={noop}
          footer={options.footer}
        />
      }
      quickActions={options.quick === false ? [] : quick}
      {...(options.composer === undefined ? {} : { composerSlot: options.composer })}
      draft=""
      onDraft={noop}
      onSend={noop}
      onAttach={noop}
      onMic={noop}
      scrollKey="lab"
    />
  );
}

const RAIN_SAVED = [
  question('q1', RAIN_QUESTION),
  answer('a1', RAIN_ANSWER, { proposals: [LAB_PLAN.changesetId] }),
];

export const CHAT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'chat-group': () => <LabSheet messages={RAIN_SAVED} />,
  'chat-empty': () => <LabSheet mode="private" quick={false} />,
  'chat-thinking': () => <LabSheet live={live({ phase: 'thinking' })} />,
  'chat-streaming': () => (
    <LabSheet live={live({ phase: 'streaming', text: 'Rain till about three. Here’s a dry' })} />
  ),
  'chat-checking': () => (
    <LabSheet live={live({ phase: 'streaming', text: 'Let me look.', checking: 1 })} />
  ),
  'chat-sources': () => (
    <LabSheet
      messages={[
        question('q1', 'Is anything on in Ubud this week?'),
        answer(
          'a1',
          'The Ubud Writers Festival runs Thursday to Sunday, and the Saturday night market moves to the football field.',
          {
            sources: [
              'https://www.ubudwritersfestival.com/program',
              'https://www.baliplus.com/ubud',
            ],
          },
        ),
      ]}
    />
  ),
  'chat-rated': () => (
    <LabSheet
      messages={[question('q1', RAIN_QUESTION), answer('a1', RAIN_ANSWER, { rating: 'up' })]}
    />
  ),
  'chat-error': () => (
    <LabSheet live={live({ phase: 'error', errorCode: 'AI_UNAVAILABLE', retryable: true })} />
  ),
  'chat-refused': () => (
    <LabSheet
      live={live(
        { phase: 'error', errorCode: 'AI_REFUSED', retryable: false },
        'Write my essay on Balinese temples',
      )}
    />
  ),
  'chat-help': () => (
    <LabSheet
      live={live(
        {
          phase: 'done',
          text: "I'm here. Let's get you to someone who can help right now.",
          helpCard: true,
        },
        'Someone is following me',
      )}
    />
  ),
  'chat-offline': () => (
    <LabSheet messages={RAIN_SAVED} waiting={['Is the cooking class still on if it floods?']} />
  ),
  'chat-sent': () => (
    <LabSheet messages={RAIN_SAVED} proposal={{ ...LAB_PLAN, status: 'voting' }} />
  ),
};
