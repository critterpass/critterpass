// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { fixturesFor } from '../gallery/registry';
import { BillingToggle } from '../monetize/BillingToggle';
import { ComparisonTable } from '../monetize/ComparisonTable';
import { KeptPausedChips } from '../monetize/KeptPausedChips';
import { PauseBars } from '../monetize/PauseBars';
import { PerksChecklist } from '../monetize/PerksChecklist';
import { PlanRadioRows } from '../monetize/PlanRadioRows';
import { SeatsRow } from '../monetize/SeatsRow';
import { TeaserPreview } from '../monetize/TeaserPreview';
import { VisaPaywall } from '../monetize/VisaPaywall';
import { AwardsGrid } from '../recap/AwardsGrid';
import { GotAway } from '../recap/GotAway';
import { MemoryHero } from '../recap/MemoryHero';
import { RecapStatTiles } from '../recap/RecapStatTiles';
import { RouteRider } from '../recap/RouteRider';
import { StampSpread } from '../recap/StampSpread';
import { renderUi } from '../test-support/render';

import '../monetize/monetize.fixtures';
import '../recap/recap.fixtures';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
const { color } = tokens;

describe('recap', () => {
  it('reads stat tiles, awards and the route as sentences', async () => {
    const onVoteMvp = jest.fn();
    await renderUi(
      <>
        <RecapStatTiles
          stats={[
            { id: 'km', value: '214 km', caption: 'driven, mostly by Made', color: color.yellow },
          ]}
        />
        <AwardsGrid
          onVoteMvp={onVoteMvp}
          awards={[
            {
              id: 'r',
              title: 'Earliest riser',
              line: 'Up at 02:51.',
              personName: 'Jordan',
              color: color.yellow,
              mvp: true,
            },
          ]}
        />
        <RouteRider
          distance="214 km"
          reached={1}
          stops={[
            { id: 's', name: 'Seminyak', dayLabel: 'Day 1' },
            { id: 'u', name: 'Ubud', dayLabel: 'Days 2–4' },
          ]}
        />
      </>,
    );
    expect(screen.getByLabelText('214 km, driven, mostly by Made')).toBeTruthy();
    expect(screen.getByLabelText('Earliest riser, Jordan, Up at 02:51., MVP')).toBeTruthy();
    await run(screen.getByRole('button', { name: 'Vote for the MVP' }), 'activate');
    expect(onVoteMvp).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Route, 214 km: Seminyak Day 1, Ubud Days 2–4')).toBeTruthy();
  });

  it('gives the got-away, stamp spread and memory one header each', async () => {
    await renderUi(
      <>
        <GotAway
          silhouette={null}
          eyebrow="The one that got away"
          name="Golden Tokek"
          story="Seen twice."
        />
        <StampSpread
          chrome="Entries"
          stamp={null}
          caption="Stamp 13 is Bali"
          detail="The crew signed it."
        />
        <MemoryHero
          photo={null}
          photoLabel="Six of you on Batur"
          eyebrow="One year ago today"
          title="Batur, a year on"
        />
      </>,
    );
    expect(
      screen.getByRole('header', { name: 'The one that got away: Golden Tokek' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Stamp 13 is Bali. The crew signed it.')).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Six of you on Batur' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'BATUR, A YEAR ON' })).toBeTruthy();
  });
});

describe('monetisation', () => {
  it('hides the decorative MRZ from screen readers', async () => {
    await renderUi(
      <VisaPaywall chrome="Visas" headline="Go further" visa={null} mrz={['P<SGPWINSTON<<<<']} />,
    );
    expect(screen.queryByText('P<SGPWINSTON<<<<')).toBeNull();
    expect(screen.getByText('P<SGPWINSTON<<<<', { includeHiddenElements: true })).toBeTruthy();
  });

  it('moves the comparison highlight and reads each row across plans', async () => {
    const onHighlight = jest.fn();
    await renderUi(
      <ComparisonTable
        highlighted="pass"
        onHighlight={onHighlight}
        columns={[
          { id: 'free', label: 'Free' },
          { id: 'pass', label: 'Pass+' },
        ]}
        rows={[{ label: 'Crew size', values: ['6', '16'] }]}
      />,
    );
    expect(screen.getByLabelText('Crew size, Free 6, Pass+ 16')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Pass+' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    await run(screen.getByRole('tab', { name: 'Free' }), 'activate');
    expect(onHighlight).toHaveBeenCalledWith('free');
  });

  it('lays the header, every row and the highlight band on one column grid', async () => {
    await renderUi(
      <ComparisonTable
        testID="compare"
        highlighted="pass"
        columns={[
          { id: 'free', label: 'Free' },
          { id: 'pass', label: 'Pass+' },
          { id: 'boost', label: 'Boost' },
        ]}
        rows={[
          { label: 'Guide chat, voice, camera', values: ['30 a day', '∞', '∞ on trip'] },
          { label: 'Crew size', values: ['6', '6', '16'] },
        ]}
      />,
    );
    const widthOf = (node: { props: { style?: unknown } } | null) =>
      StyleSheet.flatten(node?.props.style as StyleProp<ViewStyle>)?.width;
    // Label two shares, each of the three plans one: 40% then 20% columns.
    for (const tab of screen.getAllByRole('tab')) expect(widthOf(tab)).toBe('20%');
    // Values render uppercased (the label style).
    for (const value of ['30 A DAY', '∞', '∞ ON TRIP', '6', '16']) {
      for (const text of screen.getAllByText(value, { includeHiddenElements: true })) {
        expect(widthOf(text.parent)).toBe('20%');
      }
    }
    expect(widthOf(screen.getByText('Crew size', { includeHiddenElements: true }))).toBe('40%');
    const band = StyleSheet.flatten(
      screen.getByTestId('compare-band').props.style as StyleProp<ViewStyle>,
    );
    // Pass+ is the second plan column: it starts after the label and the Free column.
    expect(band).toEqual(expect.objectContaining({ start: '60%', width: '20%' }));
  });

  it('picks plans and billing periods as radios with their store prices', async () => {
    const onPlan = jest.fn();
    const onBilling = jest.fn();
    await renderUi(
      <>
        <PlanRadioRows
          label="Boost"
          value="trip"
          onChange={onPlan}
          options={[
            { id: 'trip', title: 'This trip', price: '12,00 €' },
            { id: 'year', title: 'All year', price: '59,00 €' },
          ]}
        />
        <BillingToggle
          value="yearly"
          onChange={onBilling}
          options={[
            { value: 'monthly', label: 'Monthly', price: '3,99 €' },
            { value: 'yearly', label: 'Yearly', price: '29,99 €', badge: '−37%' },
          ]}
        />
      </>,
    );
    expect(
      screen.getByRole('radio', { name: 'This trip, 12,00 €' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await run(screen.getByRole('radio', { name: 'All year, 59,00 €' }), 'activate');
    expect(onPlan).toHaveBeenCalledWith('year');
    expect(
      screen.getByRole('radio', { name: 'Yearly, 29,99 €, −37%' }).props.accessibilityState,
    ).toMatchObject({ checked: true });
    await run(screen.getByRole('radio', { name: 'Monthly, 3,99 €' }), 'activate');
    expect(onBilling).toHaveBeenCalledWith('monthly');
  });

  it('renders the server perk list, seats, teaser, pause bars and kept chips', async () => {
    await renderUi(
      <>
        <PerksChecklist perks={[{ id: 'a', text: 'Bookings pulled from your email' }]} />
        <SeatsRow
          capacity={2}
          seats={[
            { id: 'w', name: 'Winston', avatar: null },
            { id: 'm', name: 'Maya', avatar: null },
          ]}
          waiting={{ id: 's', name: 'Sam', avatar: null }}
        />
        <TeaserPreview
          preview={null}
          previewLabel="Preview · your Bali trip"
          eyebrow="Kyoto isn't boosted"
          title="The live map"
          dismiss={null}
        />
        <PauseBars
          months={[
            { label: 'N', name: 'November', paused: true },
            { label: 'A', name: 'April', paused: false, trip: true },
          ]}
        />
        <KeptPausedChips
          keptLabel="Kept for good"
          kept={['The plan']}
          pausedLabel="Pauses Oct 26"
          paused={['Live map']}
        />
      </>,
    );
    expect(screen.getByLabelText('Bookings pulled from your email')).toBeTruthy();
    expect(screen.getByLabelText('2 of 2 seats taken, Sam waiting for seat 3')).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Preview · your Bali trip' })).toBeTruthy();
    expect(screen.getByLabelText('Paused: November; Active: April')).toBeTruthy();
    expect(screen.getByLabelText('Kept for good: The plan')).toBeTruthy();
    expect(screen.getByLabelText('Pauses Oct 26: Live map')).toBeTruthy();
  });
});

describe('recap and monetisation boundaries', () => {
  it('keeps prices and data out of the components', () => {
    for (const dir of ['recap', 'monetize']) {
      const root = join(__dirname, '..', dir);
      for (const file of readdirSync(root).filter((name) => !name.includes('.fixtures.'))) {
        const source = readFileSync(join(root, file), 'utf8');
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        expect(code).not.toMatch(/from '@\/features|from '@cp\/(db|sync|api)/);
        expect(code).not.toMatch(/['"`][$€£¥]\s?\d/);
      }
    }
  });

  it('registers and renders every fixture', async () => {
    const components = [
      'RecapStatTiles',
      'AwardsGrid',
      'RouteRider',
      'GotAway',
      'StampSpread',
      'MemoryHero',
      'VisaPaywall',
      'ComparisonTable',
      'PlanRadioRows',
      'BillingToggle',
      'PerksChecklist',
      'SeatsRow',
      'TeaserPreview',
      'PauseBars',
      'KeptPausedChips',
    ];
    for (const component of components) {
      const fixtures = fixturesFor(component);
      expect(fixtures.length).toBeGreaterThan(0);
      for (const fixture of fixtures) {
        const { unmount } = await renderUi(<>{fixture.render()}</>);
        await unmount();
      }
    }
  });
});
