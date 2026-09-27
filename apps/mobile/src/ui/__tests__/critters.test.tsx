// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { BefriendReveal } from '../critters/BefriendReveal';
import { CritterDetail } from '../critters/CritterDetail';
import { DexHeader } from '../critters/DexHeader';
import { Egg } from '../critters/Egg';
import { EncounterCard } from '../critters/EncounterCard';
import { FormSelector } from '../critters/FormSelector';
import { HereNowForms } from '../critters/HereNowForms';
import { LegendaryBanner } from '../critters/LegendaryBanner';
import { MonthStrip } from '../critters/MonthStrip';
import { QuestCard } from '../critters/QuestCard';
import { SetGrid } from '../critters/SetGrid';
import { StickerShelf } from '../critters/StickerShelf';
import { WanderFootprints } from '../critters/WanderFootprints';
import { fixturesFor } from '../gallery/registry';
import { renderUi } from '../test-support/render';

import '../critters/critters.fixtures';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });

describe('critter dex', () => {
  it('speaks the dex count and filters as radios', async () => {
    const onFilter = jest.fn();
    await renderUi(
      <DexHeader
        found={9}
        total={150}
        filter="all"
        onFilter={onFilter}
        filters={[
          { value: 'all', label: 'All' },
          { value: 'found', label: 'Found' },
        ]}
      />,
    );
    expect(screen.getByRole('header', { name: '9 of 150 critters found' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'All' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    await run(screen.getByRole('radio', { name: 'Found' }), 'activate');
    expect(onFilter).toHaveBeenCalledWith('found');
  });

  it('pairs every tier with its glyph and word, and labels missing forms', async () => {
    await renderUi(
      <HereNowForms
        title="Here now · Bali"
        forms={[
          { tier: 'rare', found: true, sticker: null },
          { tier: 'epic', found: false, sticker: null },
        ]}
      />,
    );
    expect(screen.getByRole('image', { name: 'Rare form, found' })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Epic form, not found yet' })).toBeTruthy();
    expect(
      screen.getByText(`${tokens.tier.epic.glyph} EPIC`, { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('labels locked set slots by city, never by critter', async () => {
    const onOpen = jest.fn();
    await renderUi(
      <SetGrid
        title="Vietnam"
        onOpen={onOpen}
        slots={[
          {
            id: 'hn',
            name: 'Cụ Rùa',
            city: 'Hà Nội',
            sticker: null,
            formsFound: ['common', 'rare'],
          },
          { id: 'hl', city: 'Hạ Long', sticker: null },
        ]}
      />,
    );
    expect(
      screen.getByRole('image', { name: 'Undiscovered local, found by being in Hạ Long' }),
    ).toBeTruthy();
    await run(screen.getByRole('button', { name: 'Cụ Rùa, Hà Nội, 2 of 4 forms' }), 'activate');
    expect(onOpen).toHaveBeenCalledWith('hn');
  });

  it('opens the legendary banner and reads the month strip summary', async () => {
    const onPress = jest.fn();
    await renderUi(
      <>
        <LegendaryBanner eyebrow="Legendary on your dates" title="Sakura Pon" onPress={onPress} />
        <MonthStrip
          months={[
            { label: 'A', name: 'April', legendary: true, inTrip: true },
            { label: 'N', name: 'November', legendary: true },
          ]}
        />
      </>,
    );
    await run(
      screen.getByRole('button', { name: 'Legendary on your dates, Sakura Pon' }),
      'activate',
    );
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(
      screen.getByLabelText('Legendaries in April and November; your trip: April'),
    ).toBeTruthy();
  });
});

describe('critter moments', () => {
  it('reads the critter card as one header with number and tier', async () => {
    await renderUi(
      <CritterDetail
        name="Temple Tokek"
        tier="rare"
        habitat="Water temples"
        dexNumber={112}
        sticker={null}
        facts={[{ label: 'Where', value: 'Tirta Empul' }]}
      />,
    );
    expect(
      screen.getByRole('header', { name: 'Temple Tokek, Rare, Water temples, Number 112' }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Where: Tirta Empul')).toBeTruthy();
  });

  it('selects found forms and keeps locked ones unselectable with their requirement', async () => {
    const onSelect = jest.fn();
    await renderUi(
      <FormSelector
        label="Forms"
        selected="common"
        onSelect={onSelect}
        forms={[
          { tier: 'common', found: true, requirement: 'Be in Bali', sticker: null },
          { tier: 'rare', found: true, requirement: 'Three water temples', sticker: null },
          { tier: 'epic', found: false, requirement: 'Batur by sunrise', sticker: null },
        ]}
      />,
    );
    await run(screen.getByRole('radio', { name: 'Rare' }), 'activate');
    expect(onSelect).toHaveBeenCalledWith('rare');
    const epic = screen.getByRole('radio', { name: 'Epic, locked: Batur by sunrise' });
    expect(epic.props.accessibilityState).toMatchObject({ checked: false });
    await run(epic, 'activate');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('reads encounter, befriend, wander, quest, egg and shelf', async () => {
    await renderUi(
      <>
        <EncounterCard tier="rare" habitat="Water temples only" title="A temple Tokek is here" />
        <BefriendReveal
          eyebrow="Rare form · 2 of 4"
          title="Befriended!"
          critterName="Temple Tokek"
          sticker={null}
          chips={['+150 XP']}
        />
        <WanderFootprints accessibilityLabel="It wandered off" />
        <QuestCard
          title="Warung crawl"
          description="Eat at five warungs"
          color={tokens.color.orange}
          progress={{ done: 3, total: 5 }}
          reward="Reward · +120 XP"
        />
        <Egg state="wobbling" />
        <StickerShelf stickers={[{ id: '1', label: 'Tokek, common form', sticker: null }]} />
      </>,
    );
    expect(
      screen.getByRole('header', { name: 'Rare, Water temples only. A temple Tokek is here' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('header', { name: 'Befriended! Temple Tokek, Rare form · 2 of 4' }),
    ).toBeTruthy();
    expect(screen.getByRole('image', { name: 'It wandered off' })).toBeTruthy();
    expect(
      screen.getByLabelText('Warung crawl. Eat at five warungs. Reward · +120 XP'),
    ).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Warung crawl, 3 of 5 done' })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Critter egg, about to hatch' })).toBeTruthy();
    expect(screen.getByRole('image', { name: 'Tokek, common form' })).toBeTruthy();
  });

  it('draws the crack while cracking and shows the hatchling once hatched', async () => {
    const { rerender } = await renderUi(<Egg state="cracking" />);
    expect(screen.getByRole('image', { name: 'Critter egg, cracking' })).toBeTruthy();
    expect(screen.getAllByTestId('skia-path', { includeHiddenElements: true })).toHaveLength(1);
    await rerender(<Egg state="hatched" hatchlingName="Tokek" hatchling={null} />);
    expect(screen.getByRole('image', { name: 'Hatched: Tokek' })).toBeTruthy();
  });
});

describe('critter gallery fixtures', () => {
  it('registers a fixture for every critter component', () => {
    for (const component of [
      'DexHeader',
      'HereNowForms',
      'LegendaryBanner',
      'SetGrid',
      'CritterDetail',
      'FormSelector',
      'EncounterCard',
      'WanderFootprints',
      'BefriendReveal',
      'MonthStrip',
      'QuestCard',
      'Egg',
      'StickerShelf',
    ]) {
      expect(fixturesFor(component).length).toBeGreaterThan(0);
    }
  });

  it('renders the sticker-free fixtures', async () => {
    // Fixtures that show critter stickers need the native Skia renderer; the gallery covers them.
    for (const component of ['DexHeader', 'EncounterCard', 'WanderFootprints', 'MonthStrip']) {
      for (const fixture of fixturesFor(component)) {
        const { unmount } = await renderUi(<>{fixture.render()}</>);
        await unmount();
      }
    }
  });
});
