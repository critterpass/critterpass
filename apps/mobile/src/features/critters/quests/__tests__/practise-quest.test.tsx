/**
 * A phrase quest opens phrase practice: an active one offers PRACTISE in the quest's own
 * language while practice is offered at all, and a finished or missed one, or any other quest,
 * offers nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QuestCardView } from '../quest-card-view';
import { buildQuestsModel, type QuestRow } from '../quests-model';

const NOW = new Date('2026-10-02T05:00:00Z');

function card(changes: Partial<QuestRow> = {}) {
  const row: QuestRow = {
    id: 'q-say-it',
    local_date: '2026-10-02',
    slot: 0,
    template: 'phrase_practice',
    params: '{"n":5,"language":"vi"}',
    target: 5,
    reward: '{"xp":80}',
    title: 'Say it in Vietnamese',
    body: 'Practise five phrases with Chà Vá.',
    scope: 'crew',
    status: 'active',
    ends_at: '2026-10-02T16:59:59Z',
    reveal_at: null,
    i18n: null,
    ...changes,
  };
  const model = buildQuestsModel({
    loaded: true,
    trip: { startDate: '2026-10-02', endDate: '2026-10-04', tz: 'Asia/Ho_Chi_Minh' },
    crewXp: 0,
    quests: [row],
    progress: [],
    signups: [],
    members: [],
    unsettled: [],
    viewerId: null,
    now: NOW,
  });
  const built = model.cards[0];
  if (built === undefined) throw new Error('fixture');
  return built;
}

i18n.loadAndActivate({ locale: 'en', messages: {} });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function show(
  quest: ReturnType<typeof card>,
  onPractise?: (language: string | null) => void,
) {
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <QuestCardView
            card={quest}
            guide={{ kind: 'chava', name: 'Chà Vá' }}
            onSignUp={() => undefined}
            onPractise={onPractise}
          />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('a phrase quest', () => {
  it("carries the quest's language, and other quests carry none", () => {
    expect(card().practice).toEqual({ language: 'vi' });
    expect(card({ params: '{"n":5}' }).practice).toEqual({ language: null });
    expect(card({ template: 'befriend', params: '{"n":2}' }).practice).toBeNull();
  });

  it('opens practice in its language while it is active', async () => {
    const onPractise = jest.fn();
    await show(card(), onPractise);
    await fireEvent.press(screen.getByTestId('quest-practise-q-say-it'));
    expect(onPractise).toHaveBeenCalledWith('vi');
  });

  const NOTHING: readonly { name: string; changes: Partial<QuestRow>; offered: boolean }[] = [
    { name: 'finished', changes: { status: 'completed' }, offered: true },
    { name: 'missed', changes: { status: 'expired' }, offered: true },
    { name: 'active while practice is not offered', changes: {}, offered: false },
  ];
  it.each(NOTHING)('offers nothing when $name', async ({ changes, offered }) => {
    await show(card(changes), offered ? () => undefined : undefined);
    expect(screen.getByTestId('quest-card-q-say-it')).toBeTruthy();
    expect(screen.queryByTestId('quest-practise-q-say-it')).toBeNull();
  });
});
