/**
 * The help centre lab scenes for review and screenshots: each renders a pure view with fixed props
 * (the hub, search in place, a language without articles, an article, send feedback and the sent
 * page online and offline), keyed by design id and state, every handler a no-op. Interactive ones
 * keep their own state so a flow can type and pick.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture articles and notes, never shipped copy. */
import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import type { FeedbackCategory, FeedbackMood } from '@cp/domain';

import { PillButton } from '@/ui/buttons/PillButton';
import { ListCard } from '@/ui/cards/ListCard';
import { Stack } from '@/ui/layout/Stack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';

import { searchLocal, type LocalArticle } from '../data/search-local';
import { canSend, initialDraft, topicsFor, type FeedbackDraft } from '../feedback/draft';
import { FeedbackView } from '../feedback/FeedbackView';
import { SentView } from '../feedback/SentView';
import { HubView } from '../hub/HubView';
import { ReaderView } from '../reader/ReaderView';
import type { FeedbackMode } from '../routes';
import { captureMasked } from '../shake/capture';
import { PrivateContent } from '../shake/PrivateContent';
import { deviceCapturePorts } from '../shake/ShakeListener';
import { IDEA_SCENES } from './idea-scenes';

const noop = () => undefined;

const ARTICLES: readonly LocalArticle[] = [
  {
    slug: 'split-trip-boost',
    locale: 'en',
    category: 'splitting_money',
    title: 'Splitting a Trip Boost',
    summary: 'Share a boost with your crew, each paying their part in the store.',
    body_md: 'Each person pays their part in the store.',
  },
  {
    slug: 'buying-critters',
    locale: 'en',
    category: 'critters',
    title: 'Why can’t I buy critters?',
    summary: 'Critters are met on trips, never sold.',
    body_md: 'You meet critters by travelling.',
  },
  {
    slug: 'pass-plus-refunds',
    locale: 'en',
    category: 'refunds',
    title: 'Pass+ and Trip Boost refunds',
    summary: 'Refunds for purchases go through the App Store or Google Play.',
    body_md: [
      'CritterPass is billed by the store you bought it in, so the store decides any refund.',
      '',
      '## Asking for a refund',
      '1. Open your purchase history in the App Store or Google Play.',
      '2. Find **Pass+** or the **Trip Boost** and ask for a refund there.',
      '',
      'Bought it on another phone? See [Restoring Pass+](/help/restore-pass-plus).',
    ].join('\n'),
  },
  {
    slug: 'change-booking',
    locale: 'en',
    category: 'bookings',
    title: 'Changing a booking',
    summary: 'Change dates or guests with the partner you booked with.',
    body_md: 'The partner decides any refund.',
  },
];

function Hub({ englishFallback = false, start = '' }) {
  const [query, setQuery] = useState(start);
  return (
    <HubView
      guide="tokek"
      articles={ARTICLES.slice(0, 2)}
      englishFallback={englishFallback}
      query={query}
      onQuery={setQuery}
      searching={false}
      results={searchLocal(ARTICLES, query, 'settings')}
      ideasToVote={48}
      repliesVia="email"
      shakeToReport={false}
      onBack={noop}
      onReport={noop}
      onFeedback={noop}
      onSuggest={noop}
      onRate={noop}
      onArticle={noop}
      onAskHuman={noop}
    />
  );
}

function Feedback({
  mode,
  start,
}: {
  readonly mode: FeedbackMode;
  readonly start?: Partial<FeedbackDraft>;
}) {
  const [draft, setDraft] = useState<FeedbackDraft>({ ...initialDraft(mode), ...start });
  return (
    <FeedbackView
      mode={mode}
      draft={draft}
      topics={topicsFor(mode)}
      deviceLine="iOS 26.0 · v1.0 (16)"
      canSend={canSend(draft)}
      sending={false}
      tooBigNote={false}
      articleTitle={null}
      onMood={(mood: FeedbackMood) => setDraft((d) => ({ ...d, mood }))}
      onTopic={(category: FeedbackCategory) => setDraft((d) => ({ ...d, category }))}
      onText={(text) => setDraft((d) => ({ ...d, text }))}
      onAddPhoto={noop}
      onRemovePhoto={(index) =>
        setDraft((d) => ({ ...d, attachments: d.attachments.filter((_, i) => i !== index) }))
      }
      onDeviceInfo={(on) => setDraft((d) => ({ ...d, includeDeviceInfo: on }))}
      onSend={noop}
      onBack={noop}
    />
  );
}

/** A crew's spending under the buttons, so the screenshot has a real screen to cover parts of. */
const SPENDING = [
  {
    title: 'Villa in Ubud, 3 nights',
    paidBy: 'Winston paid · split 5 ways',
    amount: 'Rp 9.600.000',
  },
  { title: 'Scooter rental', paidBy: 'Jordan paid · split 4 ways', amount: 'Rp 1.200.000' },
  { title: 'Dinner at Locavore', paidBy: 'Alex paid · split 5 ways', amount: 'Rp 4.850.000' },
  { title: 'Tegallalang entry', paidBy: 'You paid · split 5 ways', amount: 'Rp 250.000' },
  { title: 'Boat to Nusa Penida', paidBy: 'Mei paid · split 5 ways', amount: 'Rp 2.750.000' },
  { title: 'Airport transfer', paidBy: 'Winston paid · split 5 ways', amount: 'Rp 450.000' },
] as const;

/**
 * What a shake does, without the shake: takes the masked screenshot of this scene (as an ordinary
 * screen, or as a private one that is covered whole) and opens the problem report with it attached.
 */
function ShakeReport() {
  const [shot, setShot] = useState<string | null | undefined>(undefined);
  if (shot !== undefined) {
    return (
      <Feedback
        mode="problem"
        start={{
          attachments: shot === null ? [] : [{ uri: shot, contentType: 'image/jpeg', bytes: null }],
        }}
      />
    );
  }
  const shake = (pathname: string) =>
    void captureMasked(pathname, deviceCapturePorts).then(setShot);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="help-shake-lab">
      <ScrollView>
        <Stack gap="16" padding="20">
          <Text variant="eyebrow">You owe Winston</Text>
          <PrivateContent>
            <Text variant="h1">Rp 4.500.000</Text>
          </PrivateContent>
          <Text variant="body">Amounts are marked private; names and places are not.</Text>
          <PillButton
            label="Shake here"
            onPress={() => shake('/explore')}
            testID="help-shake-here"
          />
          <PillButton
            label="Shake on a private screen"
            variant="secondary"
            onPress={() => shake('/wallet')}
            testID="help-shake-private"
          />
          <Text variant="eyebrow">Bali · what the crew spent</Text>
          <Stack gap="8">
            {SPENDING.map((row) => (
              <ListCard
                key={row.title}
                title={row.title}
                subtitle={row.paidBy}
                chevron={false}
                trailing={
                  <PrivateContent>
                    <Text variant="rowTitle">{row.amount}</Text>
                  </PrivateContent>
                }
              />
            ))}
          </Stack>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}

const NOTE =
  'Tokek suggested the boat on a rainy morning. Could the guide check the forecast first?';

export const HELP_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3p-1-hub': () => <Hub />,
  'hub-search': () => <Hub start="refund" />,
  'hub-no-match': () => <Hub start="karaoke" />,
  'hub-english': () => <Hub englishFallback />,
  article: () => (
    <ReaderView
      article={{ ...(ARTICLES[2] as LocalArticle), inEnglish: false }}
      helpful={null}
      onHelpful={noop}
      onOpenArticle={noop}
      onAskHuman={noop}
      onBack={noop}
    />
  ),
  '3p-2-feedback': () => (
    <Feedback mode="feedback" start={{ mood: 'good', category: 'guide_chat', text: NOTE }} />
  ),
  'feedback-empty': () => <Feedback mode="feedback" />,
  'feedback-problem': () => <Feedback mode="problem" />,
  'shake-report': () => <ShakeReport />,
  '3p-3-sent': () => (
    <SentView
      ticketNo={2291}
      queued={false}
      heading="Guide chat · Good"
      note={NOTE}
      name="Winston"
      receivedOn="26 Sep 2026"
      onDone={noop}
    />
  ),
  'sent-offline': () => (
    <SentView
      ticketNo={null}
      queued
      heading="Bug"
      note="The map froze when I opened day 3."
      name="Winston"
      receivedOn="26 Sep 2026"
      onDone={noop}
    />
  ),
  ...IDEA_SCENES,
};

export const HELP_SCENE_NAMES: readonly string[] = Object.keys(HELP_SCENES);
