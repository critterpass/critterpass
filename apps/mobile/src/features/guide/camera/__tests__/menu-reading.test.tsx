/**
 * The menu reading as the app takes it off the stream: dishes from `item` events, closed by
 * `done`; a stream that reports an error or is cut before `done` is a failed reading, never half
 * a menu. The order put together from it is shown in the menu's own words, without the prices
 * printed on its lines, and names the expense it starts. The language pill needs both names.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { parseGuideFrames } from '../../chat/data/guide-frames';
import { renderScreen } from '../../voice/test-support/screen-harness';
import { CAMERA_SCENES, MENU_LINES, MENU_READING } from '../dev/lab-scenes-camera';
import { languagePair } from '../menu-language';
import { MenuOrderCard } from '../menu-order-card';
import { createMenuReadingFold } from '../menu-reading';
import {
  changeOrder,
  dishName,
  menuStickers,
  orderCard,
  orderExpenseName,
  orderLines,
} from '../menu-scan';

/** The route's stream for a two-dish menu, as the server frames it. */
const STREAM = [
  'id: 1\nevent: item\ndata: {"ocr_line_id":"l1","translation":"Crispy rice pancake","description":"Turmeric pancake with prawns","spice":0,"flags":[],"price":{"printed":"45k","amount_minor":45000,"currency":"VND","source_line_id":"l1"}}',
  ': keep-alive',
  'id: 2\nevent: item\ndata: {"ocr_line_id":"l4","translation":"Tofu, peanut sauce","description":"Fried tofu in peanut sauce","spice":0,"flags":[{"member":"Minh","verdict":"clash","reason":"peanuts"},{"member":"","verdict":"ok","reason":"x"},{"member":"Linh","verdict":"safe","reason":"x"}],"price":null}',
  'id: 3\nevent: done\ndata: {"status":"ok","suggestion":"Skip the tofu for Minh.","checked_members":["Minh"],"source_language":"vi","ai_generated":true}',
  '',
].join('\n\n');

function read(stream: string) {
  const fold = createMenuReadingFold();
  for (const frame of parseGuideFrames(stream).frames) fold.frame(frame);
  return fold;
}

describe('the streamed reading', () => {
  it('collects the dishes and closes on done', () => {
    const reading = read(STREAM).result();
    expect(reading).toMatchObject({
      status: 'ok',
      suggestion: 'Skip the tofu for Minh.',
      checked_members: ['Minh'],
      source_language: 'vi',
    });
    expect(reading.items.map((item) => item.ocr_line_id)).toEqual(['l1', 'l4']);
    expect(reading.items[0]?.price).toEqual({
      printed: '45k',
      amountMinor: 45000,
      currency: 'VND',
    });
    // Only a named member with a verdict the app knows is shown as a flag.
    expect(reading.items[1]?.flags).toEqual([
      { member: 'Minh', verdict: 'clash', reason: 'peanuts' },
    ]);
  });

  it('is a failed reading when the stream is cut before done, or reports an error', () => {
    const cut = STREAM.slice(0, STREAM.indexOf('id: 3'));
    expect(() => read(cut).result()).toThrow();
    const broken = `${cut}id: 3\nevent: error\ndata: {"code":"AI_UNAVAILABLE","retryable":true}\n\n`;
    expect(() => read(broken).result()).toThrow('AI_UNAVAILABLE');
  });

  it('passes on a menu the guide could not read as its own status', () => {
    const none = 'id: 1\nevent: done\ndata: {"status":"no_dishes","suggestion":null}\n\n';
    expect(read(none).result()).toMatchObject({ status: 'no_dishes', items: [] });
    const odd = 'id: 1\nevent: done\ndata: {"status":"whatever"}\n\n';
    expect(read(odd).result().status).toBe('failed');
  });
});

describe('an order from the menu', () => {
  const stickers = menuStickers(MENU_LINES, MENU_READING);

  it("names a dish in the menu's words without its printed price", () => {
    expect(stickers.map((sticker) => sticker.name)).toEqual([
      'Bánh xèo',
      'Gỏi cuốn',
      'Bò lá lốt',
      'Đậu hũ sốt đậu phộng',
    ]);
    const price = { printed: '35k', amountMinor: 35000, currency: 'VND' };
    expect(dishName('Gado-gado ...... 35k', price)).toBe('Gado-gado');
    expect(dishName('35k', price)).toBe('35k');
    expect(dishName('Phở 24 đặc biệt', null)).toBe('Phở 24 đặc biệt');
  });

  it('counts dishes up and down, and drops one at zero', () => {
    let order = changeOrder({}, 'l2', 1);
    order = changeOrder(order, 'l1', 1);
    order = changeOrder(order, 'l1', 1);
    expect(order).toEqual({ l1: 2, l2: 1 });
    expect(changeOrder(order, 'l2', -1)).toEqual({ l1: 2 });
    expect(changeOrder({}, 'l3', -1)).toEqual({});
  });

  it('is shown in menu order, in the local words, and names the expense', () => {
    const lines = orderLines(stickers, { l2: 1, l1: 2 });
    expect(orderCard(lines)).toEqual({
      phrase: '2 × Bánh xèo\n1 × Gỏi cuốn',
      gloss: '2 × Crispy rice pancake, 1 × Fresh spring rolls',
    });
    expect(orderExpenseName(lines)).toBe('Bánh xèo, Gỏi cuốn');
    expect(orderExpenseName(lines, 12)).toBe('Bánh xèo');
  });

  it('offers showing and splitting only once a dish is picked', async () => {
    const onChange = jest.fn();
    const card = (order: Record<string, number>) => (
      <MenuOrderCard
        guideName="Ngựa"
        crewSize={6}
        stickers={stickers}
        order={order}
        onChange={onChange}
        onShow={() => undefined}
        onSplit={() => undefined}
        onAsk={() => undefined}
        onClose={() => undefined}
      />
    );
    const shown = await renderScreen(card({}));
    expect(screen.getByTestId('guide-camera-order-show')).toBeDisabled();
    expect(screen.queryByTestId('guide-camera-order-split')).toBeNull();
    await fireEvent.press(screen.getByTestId('guide-camera-order-add-l3'));
    expect(onChange).toHaveBeenCalledWith('l3', 1);

    await shown.rerender(card({ l3: 2 }));
    expect(screen.getByTestId('guide-camera-order-count-l3')).toHaveTextContent('× 2');
    expect(screen.getByTestId('guide-camera-order-show')).toBeEnabled();
    expect(screen.getByTestId('guide-camera-order-split')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('guide-camera-order-less-l3'));
    expect(onChange).toHaveBeenCalledWith('l3', -1);
  });

  it('keeps the advisory line up while the order card is open', async () => {
    await renderScreen((CAMERA_SCENES['camera-order'] as () => React.ReactElement)());
    expect(screen.getByTestId('guide-camera-order')).toBeTruthy();
    expect(screen.getByTestId('guide-camera-caution')).toBeTruthy();
    expect(screen.queryByTestId('guide-camera-follow-ups')).toBeNull();
  });
});

describe('the language pill', () => {
  const names = { id: 'Indonesian', en: 'English', vi: 'Vietnamese' };

  it("pairs the menu's language with the reader's", () => {
    expect(languagePair(names, 'id', 'en')).toBe('Indonesian → English');
    expect(languagePair(names, 'vi-VN', 'en-GB')).toBe('Vietnamese → English');
  });

  it('shows nothing for an unknown language or a menu already in the reader language', () => {
    expect(languagePair(names, null, 'en')).toBeNull();
    expect(languagePair(names, 'sw', 'en')).toBeNull();
    expect(languagePair(names, 'en', 'en-GB')).toBeNull();
  });
});
