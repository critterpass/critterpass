/**
 * Point and ask: one scan goes still → the phone's text recognition → the menu route with the
 * lines only; each way it stops short lands in its own state; stickers sit on the lines the guide
 * named and nowhere else; and the advisory line is on screen whenever a dietary flag is.
 */

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { renderScreen } from '../../voice/test-support/screen-harness';
import { CAMERA_SCENES, MENU_LINES, MENU_READING } from '../dev/lab-scenes-camera';
import { menuStickers, showsFlags, type MenuLine, type MenuReading } from '../menu-scan';
import {
  createMenuScanController,
  linesForRoute,
  MENU_MAX_LINES,
  type MenuScanPorts,
  type RecognisedStill,
} from '../menu-scan-controller';

const RECOGNISED: RecognisedStill = { status: 'ok', lines: MENU_LINES, width: 900, height: 720 };

function harness(overrides: Partial<MenuScanPorts> = {}) {
  const phases: string[] = [];
  const read = jest.fn((_lines: readonly MenuLine[]): Promise<MenuReading> =>
    Promise.resolve(MENU_READING),
  );
  const ports: MenuScanPorts = {
    capture: () => Promise.resolve('file:///tmp/menu.jpg'),
    recognize: () => Promise.resolve(RECOGNISED),
    online: () => true,
    read,
    ...overrides,
  };
  const controller = createMenuScanController(ports, (state) =>
    phases.push(state.issue ?? state.phase),
  );
  return { controller, phases, read };
}

describe('a scan', () => {
  it('takes a still, reads its lines on the phone and sends only the lines', async () => {
    const { controller, phases, read } = harness();
    await controller.scan();
    expect(phases).toEqual(['capturing', 'reading', 'result']);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0]).toEqual(MENU_LINES);
    expect(controller.state.still).toEqual({
      uri: 'file:///tmp/menu.jpg',
      width: 900,
      height: 720,
    });
    expect(controller.state.reading).toBe(MENU_READING);
  });

  it('does not ask the guide when the phone found no writing or cannot read the script', async () => {
    const empty = harness({
      recognize: () => Promise.resolve({ ...RECOGNISED, status: 'no_text', lines: [] }),
    });
    await empty.controller.scan();
    expect(empty.controller.state).toMatchObject({
      phase: 'aiming',
      issue: 'no_text',
      still: null,
    });
    expect(empty.read).not.toHaveBeenCalled();

    const script = harness({
      recognize: () => Promise.resolve({ ...RECOGNISED, status: 'unsupported_script', lines: [] }),
    });
    await script.controller.scan();
    expect(script.controller.state.issue).toBe('unsupported_script');
    expect(script.read).not.toHaveBeenCalled();

    const noStill = harness({ capture: () => Promise.resolve(null) });
    await noStill.controller.scan();
    expect(noStill.controller.state.issue).toBe('capture_failed');
  });

  it('keeps the photo up offline without calling the route, and another photo starts over', async () => {
    const { controller, read } = harness({ online: () => false });
    await controller.scan();
    expect(controller.state).toMatchObject({ phase: 'result', issue: 'offline', reading: null });
    expect(controller.state.still).not.toBeNull();
    expect(read).not.toHaveBeenCalled();
    controller.retake();
    expect(controller.state).toMatchObject({ phase: 'aiming', issue: null, still: null });
  });

  it('names a spent meter, the fair-use stop, an unreadable menu and a dropped call apart', async () => {
    const refusedWith = async (error: object) => {
      const { controller } = harness({
        read: () => Promise.reject(Object.assign(new Error('refused'), error)),
      });
      await controller.scan();
      return controller.state.issue;
    };
    expect(await refusedWith({ code: 'QUOTA_EXHAUSTED' })).toBe('quota');
    expect(await refusedWith({ code: 'RATE_LIMITED', reason: 'fair_use' })).toBe('fair_use');
    expect(await refusedWith({})).toBe('failed');

    const noDishes = harness({
      read: () => Promise.resolve({ ...MENU_READING, status: 'no_dishes', items: [] }),
    });
    await noDishes.controller.scan();
    expect(noDishes.controller.state).toMatchObject({ phase: 'result', issue: 'no_dishes' });
  });

  it('ignores a second tap while a scan is running, and a reading that lands after a retake', async () => {
    let finish: (reading: MenuReading) => void = () => undefined;
    const { controller, read } = harness({
      read: jest.fn(
        () =>
          new Promise<MenuReading>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const first = controller.scan();
    await controller.scan();
    await Promise.resolve();
    controller.retake();
    finish(MENU_READING);
    await first;
    expect(controller.state).toMatchObject({ phase: 'aiming', reading: null });
    expect(read).not.toHaveBeenCalled();
  });

  it('a camera that cannot run leaves nothing to scan', () => {
    const { controller, read } = harness();
    controller.cameraFailed('camera_denied');
    expect(controller.state.issue).toBe('camera_denied');
    expect(read).not.toHaveBeenCalled();
  });
});

describe('the lines sent', () => {
  it('are trimmed to what the route takes', () => {
    const many = Array.from({ length: 150 }, (_, index) => ({
      id: `l${index}`,
      text: index === 0 ? '   ' : `  ${'x'.repeat(260)}  `,
      bbox: [0, 0, 1, 0.01] as const,
    }));
    const sent = linesForRoute(many);
    expect(sent).toHaveLength(MENU_MAX_LINES);
    expect(sent[0]?.id).toBe('l1');
    expect(sent.every((line) => line.text.length === 200)).toBe(true);
  });
});

describe('stickers and flags', () => {
  it('puts a sticker only on a line the phone found, top to bottom, pink on a clash', () => {
    const reading: MenuReading = {
      ...MENU_READING,
      items: [
        ...[...MENU_READING.items].reverse(),
        {
          ocr_line_id: 'ghost',
          translation: 'Not on the menu',
          description: '',
          spice: null,
          flags: [],
        },
      ],
    };
    const stickers = menuStickers(MENU_LINES, reading);
    expect(stickers.map((sticker) => sticker.id)).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(stickers.map((sticker) => sticker.clash)).toEqual([false, false, false, true]);
    expect(stickers[3]).toMatchObject({ source: 'Đậu hũ sốt đậu phộng 35k', y: 0.74 });
    expect(menuStickers(MENU_LINES, null)).toEqual([]);
  });

  it('shows the advisory line whenever a flag is on screen, and not without one', async () => {
    const scene = (name: string) => (CAMERA_SCENES[name] as () => React.ReactElement)();
    expect(showsFlags(MENU_READING)).toBe(true);
    const shown = await renderScreen(scene('camera-menu'));
    expect(screen.getByTestId('guide-menu-flag-clash')).toBeTruthy();
    expect(screen.getByTestId('guide-menu-flag-ok')).toBeTruthy();
    expect(screen.getByTestId('guide-camera-caution')).toBeTruthy();

    await shown.rerender(scene('camera-menu-no-flags'));
    expect(screen.getByTestId('guide-menu-sticker-l4')).toBeTruthy();
    expect(screen.queryByTestId('guide-menu-flag-clash')).toBeNull();
    expect(screen.queryByTestId('guide-camera-caution')).toBeNull();
  });

  it('offers no scan button when the camera cannot run, and no follow-ups without a reading', async () => {
    const scene = (name: string) => (CAMERA_SCENES[name] as () => React.ReactElement)();
    const shown = await renderScreen(scene('camera-denied'));
    expect(screen.getByTestId('guide-camera-denied')).toBeTruthy();
    expect(screen.queryByTestId('guide-camera-scan')).toBeNull();

    await shown.rerender(scene('camera-offline'));
    expect(screen.getByTestId('guide-camera-issue-offline')).toBeTruthy();
    expect(screen.queryByTestId('guide-camera-follow-ups')).toBeNull();
    expect(screen.getByTestId('guide-camera-retake')).toBeTruthy();
  });
});
