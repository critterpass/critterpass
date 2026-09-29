// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { act, fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { I18nManager, View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { ActionCard } from '../cards/ActionCard';
import { Card } from '../cards/Card';
import { CrewCard } from '../cards/CrewCard';
import { DashedAddCard } from '../cards/DashedAddCard';
import { ListCard } from '../cards/ListCard';
import { TileGrid } from '../cards/TileGrid';
import { fixturesFor, listComponents } from '../gallery/registry';
import { DOODLES } from '../icons/generated';
import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { StraightArrow } from '../icons/StraightArrow';
import { DOODLE_A11Y } from '../icons/labels';
import { barsPath, dotGridPath, parseDotLayer, ringsPath, wedgesPath } from '../textures/geometry';
import { Halftone } from '../textures/halftone';
import { TEXTURE } from '../textures/texture-tokens';
import { renderUi } from '../test-support/render';

import '../icons/icons.fixtures';
import '../textures/textures.fixtures';
import '../cards/cards.fixtures';

const NAMES = Object.keys(DOODLES) as DoodleName[];
const count = (path: string, command: string) => path.split(command).length - 1;
const skiaPaths = () => screen.queryAllByTestId('skia-path', { includeHiddenElements: true });
const skiaProps = (node: { props: Record<string, unknown> }) =>
  node.props.skiaProps as Record<string, unknown>;

describe('doodle icon set', () => {
  it('draws every doodle with only a brush colour, none of them blank', async () => {
    for (const name of NAMES) {
      const { unmount } = await renderUi(<Icon name={name} color={tokens.color.ink['850']} />);
      const painted = skiaPaths().filter((path) => skiaProps(path)['color'] !== undefined);
      expect({ name, painted: painted.length > 0 }).toEqual({ name, painted: true });
      await act(() => unmount());
    }
  });

  it('draws the straight arrow in its colour, turned to its direction', async () => {
    await renderUi(<StraightArrow direction="up" color={tokens.color.ink['850']} testID="send" />);
    const box = screen.getByTestId('send', { includeHiddenElements: true });
    expect(box.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 20, height: 20 })]),
    );
    expect(
      JSON.stringify(
        box.children.map((part) => (typeof part === 'string' ? part : part.props['style'])),
      ),
    ).toContain(tokens.color.ink['850']);
  });

  it('draws an accent-only doodle (the arrow) in its brush colour', async () => {
    await renderUi(<Icon name="arrow" color={tokens.color.ink['850']} />);
    const colors = skiaPaths().map((path) => skiaProps(path)['color']);
    expect(colors.length).toBe(DOODLES.arrow.layers.length);
    expect(new Set(colors)).toEqual(new Set([tokens.color.ink['850']]));
  });

  it('gives every extracted doodle a registry entry and drawable layers', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(28);
    for (const name of NAMES) {
      expect(DOODLE_A11Y[name]).toBeDefined();
      expect(DOODLES[name].layers.length).toBeGreaterThan(0);
      for (const layer of DOODLES[name].layers) expect(layer.d).toMatch(/^M[\d.-]+ [\d.-]+L.*Z$/);
    }
  });

  it('labels meaningful icons with their localised registry label', async () => {
    await renderUi(<Icon name="pin" />);
    expect(screen.getByRole('image', { name: 'Place' })).toBeTruthy();
  });

  it('lets the caller give the specific meaning', async () => {
    await renderUi(<Icon name="plane" label="Flight to Bali" />);
    expect(screen.getByRole('image', { name: 'Flight to Bali' })).toBeTruthy();
  });

  it('hides decorative doodles from the accessibility tree', async () => {
    const decorative = NAMES.filter((name) => DOODLE_A11Y[name].decorative);
    expect(decorative).toEqual(expect.arrayContaining(['underline', 'circle', 'squiggle']));
    await renderUi(
      <View>
        {decorative.map((name) => (
          <Icon key={name} name={name} testID={`icon-${name}`} />
        ))}
        <Icon name="pin" decorative testID="icon-pin" />
      </View>,
    );
    expect(screen.queryAllByRole('image')).toHaveLength(0);
    const pin = screen.getByTestId('icon-pin', { includeHiddenElements: true });
    expect(pin.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(pin.props.accessibilityElementsHidden).toBe(true);
  });

  it('draws accent washes only when an accent exists', async () => {
    const accentLayers = DOODLES.pin.layers.filter((layer) => layer.paint === 'accent').length;
    expect(accentLayers).toBeGreaterThan(0);
    const { rerender } = await renderUi(<Icon name="pin" />);
    const plain = skiaPaths().length;
    await rerender(<Icon name="pin" accent={tokens.color.pink} />);
    expect(skiaPaths().length).toBe(plain + accentLayers);
  });

  it('falls back to the design default accent (star washes yellow)', async () => {
    expect(DOODLES.star.defaultAccent).toBe('color.yellow');
    await renderUi(<Icon name="star" color={tokens.color.ink[950]} />);
    const colours = skiaPaths().map((node) => skiaProps(node).color);
    expect(colours).toContain(tokens.color.yellow);
  });

  it('mirrors directional doodles in right-to-left layouts only', async () => {
    const replaced = jest.replaceProperty(I18nManager, 'isRTL', true);
    try {
      await renderUi(
        <View>
          <Icon name="plane" size={40} />
          <Icon name="pin" size={40} />
        </View>,
      );
      const groups = screen.getAllByTestId('skia-group', { includeHiddenElements: true });
      const transforms = groups.map((node) => JSON.stringify(skiaProps(node).transform));
      expect(transforms[0]).toContain('"scaleX":-0.4');
      expect(transforms[1]).toBe(JSON.stringify([{ scale: 0.4 }]));
    } finally {
      replaced.restore();
    }
  });
});

describe('textures', () => {
  it('reads every texture token into drawable numbers', () => {
    expect(TEXTURE.halftone).toEqual({
      color: tokens.texture.halftone.color,
      radius: 1.3,
      grid: 8,
    });
    expect(TEXTURE.halftoneDark.layers.map((layer) => layer.grid)).toEqual([9, 9]);
    expect(TEXTURE.guilloche.originY).toBeCloseTo(1.2);
    expect(TEXTURE.holo.colors).toHaveLength(4);
  });

  it('builds token-pitched geometry', () => {
    expect(count(dotGridPath(80, 40, 8, 1.3), 'M')).toBe(50);
    expect(count(barsPath(20, 10, 2, 2), 'M')).toBe(5);
    expect(count(wedgesPath(100, 100, 9), 'M')).toBe(20);
    expect(TEXTURE.halftoneDark.layers[0]).toEqual({
      color: expect.stringMatching(/^rgba\(255,216,74/),
      grid: 9,
    });
    expect(() => parseDotLayer('dots')).toThrow('unreadable');
    // Rings centred below the box start at the first ring that can reach it.
    const rings = ringsPath(100, 100, 0.5, 1.2, 7);
    expect(rings.startsWith('M71 120')).toBe(true);
  });

  it('draws once laid out and stays out of the accessibility tree', async () => {
    await renderUi(<Halftone />);
    const canvas = screen.getByTestId('texture-halftone', { includeHiddenElements: true });
    expect(canvas.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(skiaPaths()).toHaveLength(0);
    // The canvas is `pointerEvents="none"`, which RNTL's fireEvent honours; call the handler directly.
    const onLayout = canvas.props.onLayout as (event: object) => void;
    await act(() => onLayout({ nativeEvent: { layout: { width: 80, height: 40 } } }));
    expect(skiaPaths()).toHaveLength(1);
  });
});

describe('cards', () => {
  const activate = { nativeEvent: { actionName: 'activate' } };

  it('makes a pressable card one labelled button with an activate action', async () => {
    const onPress = jest.fn();
    await renderUi(
      <Card onPress={onPress} accessibilityLabel="Open Bali">
        <View />
      </Card>,
    );
    const button = screen.getByRole('button', { name: 'Open Bali' });
    expect(button.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ minHeight: 44, minWidth: 44 })]),
    );
    await fireEvent(button, 'accessibilityAction', activate);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads list cards, tiles, crews and add slots as single labelled elements', async () => {
    const onPress = jest.fn();
    await renderUi(
      <View>
        <ListCard title="Hotel Tugu" subtitle="4 nights" onPress={onPress} />
        <TileGrid tiles={[{ key: 'm', title: 'Money', caption: 'You owe $42', onPress }]} />
        <CrewCard
          name="The Bali Six"
          detail="Oct 12–19"
          membersLabel="6 members"
          onPress={onPress}
        />
        <DashedAddCard label="Pitch a place" shape="circle" onPress={onPress} />
      </View>,
    );
    for (const name of [
      'Hotel Tugu, 4 nights',
      'Money, You owe $42',
      'The Bali Six, Oct 12–19, 6 members',
      'Pitch a place',
    ]) {
      await fireEvent(screen.getByRole('button', { name }), 'accessibilityAction', activate);
    }
    expect(onPress).toHaveBeenCalledTimes(4);
  });

  it('slides a handled action card off and reports when it has collapsed', async () => {
    const onDismissed = jest.fn();
    const { rerender } = await renderUi(
      <ActionCard title="Approve Ubud?" onDismissed={onDismissed} testID="action" />,
    );
    expect(screen.getByText(/approve ubud/i)).toBeTruthy();
    await rerender(
      <ActionCard title="Approve Ubud?" onDismissed={onDismissed} handled testID="action" />,
    );
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/approve ubud/i)).toBeNull();
  });
});

describe('gallery fixtures', () => {
  it('registers every family built here', () => {
    expect(listComponents()).toEqual(
      expect.arrayContaining([
        'Icon',
        'Texture',
        'Card',
        'ListCard',
        'TileGrid',
        'HeroPanel',
        'CountdownCard',
        'ActionCard',
        'SuggestionCard',
        'DashedAddCard',
        'CrewCard',
      ]),
    );
  });

  it('renders the icon, texture and sticker-free card fixtures', async () => {
    // Fixtures that show a guide sticker need the native Skia renderer; the gallery covers them.
    const withSticker = new Set(['HeroPanel', 'CountdownCard']);
    for (const component of ['Icon', 'Texture', 'Card', 'ListCard', 'TileGrid', 'ActionCard']) {
      for (const fixture of fixturesFor(component)) {
        if (withSticker.has(component)) continue;
        const { unmount } = await renderUi(<>{fixture.render()}</>);
        await unmount();
      }
    }
  });
});
