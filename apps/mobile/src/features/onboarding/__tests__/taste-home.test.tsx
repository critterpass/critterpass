// Skia's native renderer does not exist under Jest; see ui/test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: unknown }) => children,
  Redirect: () => null,
}));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { tasteFromAnswers, type GeoHint } from '@cp/domain';

import { onboardingQuiz } from '../content';
import { clearDraftForTests, readDraft, updateDraft } from '../flow-controller/draft-store';
import { HomeScreen } from '../home/HomeScreen';
import { homeResults } from '../home/home-search';
import { TasteScreen } from '../taste/TasteScreen';
import { airportDataset } from '../content';
import { fakeServices, renderOnboarding } from '../test-support/harness';

const activate = (element: Parameters<typeof fireEvent>[0]) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

async function pick(side: 'left' | 'right') {
  jest.useFakeTimers();
  await activate(screen.getAllByTestId(`taste-card-${side}`)[0]!);
  await act(async () => {
    jest.advanceTimersByTime(600);
    await Promise.resolve();
  });
  jest.useRealTimers();
}

beforeEach(() => {
  clearDraftForTests();
  updateDraft((d) => ({
    ...d,
    given_name: 'Winston',
    avatar: { kind: 'critter', form_id: 'guide:tokek' },
    step: 'taste',
  }));
  jest.mocked(router.push).mockClear();
});

describe('3a-4 this or that', () => {
  it('turns six answers into the expected tags, stamped onto the pass', async () => {
    await renderOnboarding(<TasteScreen />);
    expect(screen.getByTestId('taste-counter')).toHaveTextContent('1 OF 6');
    const sides = ['left', 'right', 'left', 'right', 'left', 'right'] as const;
    for (const side of sides) await pick(side);
    const answers = readDraft()!.answers;
    expect(answers.map((a) => a.value)).toEqual([...sides]);
    const expected = tasteFromAnswers(onboardingQuiz(), answers).tags;
    expect(expected.length).toBeGreaterThan(0);
    expect(screen.getByTestId('taste-summary')).toBeTruthy();
    expect(screen.getByTestId('taste-disclosure')).toHaveTextContent(/crews see these tags/u);
    await activate(screen.getByTestId('taste-done'));
    expect(readDraft()?.taste_done).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/onboarding/home');
  });

  it('undoes the last answer and skips a question without a tag', async () => {
    await renderOnboarding(<TasteScreen />);
    await pick('left');
    expect(readDraft()!.answers).toHaveLength(1);
    await activate(screen.getByTestId('taste-undo'));
    expect(readDraft()!.answers).toHaveLength(0);
    await activate(screen.getByTestId('taste-skip'));
    expect(readDraft()!.answers).toEqual([{ q_id: onboardingQuiz()[0]!.id, value: 'skip' }]);
    expect(screen.getByTestId('taste-counter')).toHaveTextContent('2 OF 6');
  });

  it('keeps undo and skip out of an answer that is still landing', async () => {
    await renderOnboarding(<TasteScreen />);
    jest.useFakeTimers();
    await activate(screen.getAllByTestId('taste-card-left')[0]!);
    // The card is in the air: its answer is the only thing written when it lands.
    await activate(screen.getByTestId('taste-skip'));
    await activate(screen.getByTestId('taste-undo'));
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(readDraft()!.answers).toEqual([{ q_id: onboardingQuiz()[0]!.id, value: 'left' }]);
    jest.useRealTimers();
  });

  it('summarises an all-skipped quiz and can start over', async () => {
    await renderOnboarding(<TasteScreen />);
    for (let i = 0; i < 6; i++) await activate(screen.getByTestId('taste-skip'));
    expect(screen.getByText('All skipped. The guides will learn as you go.')).toBeTruthy();
    await activate(screen.getByTestId('taste-retake'));
    expect(readDraft()!.answers).toEqual([]);
  });
});

const SINGAPORE: GeoHint = {
  country: 'SG',
  city: 'Singapore',
  point: { lat: 1.3, lng: 103.8 },
  nearest_iata: ['SIN'],
};

describe('3a-5 home base', () => {
  beforeEach(() => {
    updateDraft((d) => ({ ...d, taste_done: true, step: 'home' }));
  });

  it('searches offline, puts SIN first for Sing, and inks the stamp', async () => {
    await renderOnboarding(<HomeScreen />);
    await fireEvent.changeText(screen.getByTestId('home-search'), 'Sing');
    const rows = screen.getAllByTestId(/^home-row-/u).map((row) => row.props.testID as string);
    expect(rows[0]).toBe('home-row-SIN');
    await activate(screen.getByTestId('home-row-SIN'));
    expect(screen.getByTestId('home-stamp')).toBeTruthy();
    await activate(screen.getByTestId('onboarding-home-next'));
    const draft = readDraft()!;
    expect(draft.home_iata).toBe('SIN');
    expect(draft.issued_at).not.toBeNull();
    expect(router.push).toHaveBeenCalledWith('/onboarding/issued');
  });

  it('never writes the typed text back into the search field', async () => {
    // A value set from state can land after the next keystroke on a busy JS thread and reorder
    // the letters on an iPhone ("Sngi" for "Sing"): the native field keeps what was typed.
    await renderOnboarding(<HomeScreen />);
    await fireEvent.changeText(screen.getByTestId('home-search'), 'Sing');
    expect(screen.getByTestId('home-search').props.value).toBeUndefined();
    expect(screen.getAllByTestId(/^home-row-/u)[0]?.props.testID).toBe('home-row-SIN');
  });

  it('shows the hint’s nearest airports with a drive time from another country', async () => {
    const services = fakeServices({ geoHint: () => Promise.resolve(SINGAPORE) });
    await renderOnboarding(<HomeScreen />, { services });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('home-row-SIN')).toBeTruthy();
    const johor = screen.getByTestId('home-row-JHB');
    expect(johor.props.accessibilityLabel).toMatch(/Malaysia · \d+ min away/u);
  });

  it('works with no signal and no hint, and says when nothing matches', async () => {
    const services = fakeServices({ geoHint: () => Promise.reject(new Error('offline')) });
    await renderOnboarding(<HomeScreen />, { services });
    expect(screen.queryAllByTestId(/^home-row-/u)).toHaveLength(0);
    await fireEvent.changeText(screen.getByTestId('home-search'), 'lon');
    expect(screen.getByTestId('home-row-LON')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('home-search'), 'Qqqqzz');
    expect(screen.getByTestId('home-no-results')).toBeTruthy();
  });

  it('flags a home far from any airport', () => {
    const far = homeResults(airportDataset(), '', {
      country: 'AU',
      city: null,
      point: { lat: -25.3, lng: 131.0 - 6 },
      nearest_iata: [],
    });
    expect(far.farMinutes).not.toBeNull();
  });
});
