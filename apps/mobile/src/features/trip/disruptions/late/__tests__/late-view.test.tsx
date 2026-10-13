/**
 * The running-late screen's behaviour, rendered from fixtures: a late member picks among
 * the offered options and the button names the pick; whoever waits is told and offered nothing to
 * pick; "said yes" shows only once the place answered; a settled pick cannot be sent twice.
 */
// The screen reaches the plan's helpers and their device database opener and billing module,
// which Jest cannot load; nothing here reads a database.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { LateScenePremium } from '../../../premium/day-change/RunningLatePremium';
import { lateModel } from '../model';
import { lateFixtures } from '../test-support/late-fixtures';
import type { LateScene } from '../use-known-late';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const FIXTURES = lateFixtures();
const fixture = (name: string) => (FIXTURES[name] as () => LateScene)();

async function show(node: ReactNode) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  return await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <ScreenJoltProvider>{node}</ScreenJoltProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}
const scene = (name: string) => show(<LateScenePremium late={fixture(name)} />);

const withChoose = (name: string, onChoose: (option: string) => void): LateScene => {
  const base = fixture(name);
  return { ...base, props: { ...base.props, onChoose } };
};

describe('running-late screen', () => {
  it('offers the late member only what the planner offered, starting on its pick', async () => {
    await scene('3k-9');
    expect(screen.getByText('+25 min')).toBeTruthy();
    expect(screen.getByTestId('late-option-push')).toBeTruthy();
    expect(screen.getByTestId('late-option-skip')).toBeTruthy();
    expect(screen.queryByTestId('late-option-walk')).toBeNull();
    expect(screen.queryByTestId('late-option-car')).toBeNull();
    expect(screen.getByText(/^push to 14:30$/iu)).toBeTruthy();
    // Nobody has asked Karsa yet: the option says so.
    expect(screen.getByText(/^ask karsa$/iu)).toBeTruthy();
    expect(screen.queryByText(/^karsa said yes$/iu)).toBeNull();
  });

  it('says the place agreed only once it answered', async () => {
    await scene('3k-9-vendor-said-yes');
    expect(screen.getByText(/^karsa said yes$/iu)).toBeTruthy();
  });

  it('sends the option the member switched to', async () => {
    const onChoose = jest.fn();
    await show(<LateScenePremium late={withChoose('3k-9', onChoose)} />);
    await fireEvent.press(screen.getByTestId('late-option-skip'));
    await fireEvent.press(screen.getByTestId('late-choose'));
    expect(onChoose).toHaveBeenCalledWith('skip');
  });

  it('does not send a settled pick again', async () => {
    const onChoose = jest.fn();
    await show(<LateScenePremium late={withChoose('3k-9-chosen', onChoose)} />);
    await fireEvent.press(screen.getByTestId('late-choose'));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('tells whoever waits who is late and offers them nothing to pick', async () => {
    await scene('3k-9-waiting-crew');
    expect(screen.getByTestId('late-waiting-title')).toBeTruthy();
    expect(screen.getByText('Karsa Spa starts 14:00 for you.')).toBeTruthy();
    expect(screen.queryByTestId('late-choose')).toBeNull();
    expect(screen.queryByTestId('late-option-push')).toBeNull();
  });

  it('marks a stale ETA, and drops the options once on time again', async () => {
    await scene('3k-9-stale');
    expect(screen.getByText('Last ETA 14:25')).toBeTruthy();
    await scene('3k-9-on-time');
    expect(screen.getAllByTestId('late-on-time').length).toBeGreaterThan(0);
  });
});

describe('lateModel', () => {
  it('reads the role from the party lists and survives rows it cannot parse', () => {
    const model = lateModel(
      {
        id: 'spa-late',
        trip_id: 'bali-trip',
        kind: 'running_late',
        status: 'open',
        title: 'Karsa Spa',
        summary: '',
        affected: '{broken',
        facts: null,
        options: '[{"id":"teleport"}]',
        actions: null,
        chosen_option_id: 'teleport',
        i18n: null,
      },
      'someone',
    );
    expect(model).toMatchObject({ role: 'other', options: [], chosen: null, lateMin: 0 });
  });
});
