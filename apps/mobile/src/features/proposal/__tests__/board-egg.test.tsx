// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { screen } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { FadeInDown } from 'react-native-reanimated';

import { renderUi } from '@/ui/test-support/render';

import { BoardView, type BoardViewProps } from '../board/board-view';

const noop = () => undefined;

const pass = (boarded: boolean): BoardViewProps => ({
  guide: 'chava',
  eyebrow: 'Đà Nẵng · Oct 2–4',
  name: 'Linh',
  crewIn: [{ key: 'u-khanh', name: 'Khanh', joinIndex: 0 }],
  counter: '1/2',
  boarded,
  pending: false,
  ticket: {
    from: 'SGN',
    to: 'DAD',
    passenger: 'Linh Nguyen',
    dates: 'Oct 2–4',
    share: null,
    group: 'Proposal Crew',
    seat: 'A02',
  },
  onBoard: noop,
  onMaybe: noop,
  onOut: noop,
  onDone: noop,
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the egg on the boarding pass', () => {
  it('is drawn at once, with no entering animation, on a pass opened already boarded', async () => {
    const entering = jest.spyOn(FadeInDown, 'delay');
    await renderUi(<BoardView {...pass(true)} />);
    expect(screen.getByTestId('board-egg')).toBeTruthy();
    expect(entering).not.toHaveBeenCalled();
  });

  it('drops in when boarding happens on this screen', async () => {
    const entering = jest.spyOn(FadeInDown, 'delay');
    const view = await renderUi(<BoardView {...pass(false)} />);
    expect(screen.queryByTestId('board-egg')).toBeNull();
    expect(entering).not.toHaveBeenCalled();

    await view.rerender(<BoardView {...pass(true)} />);
    expect(screen.getByTestId('board-egg')).toBeTruthy();
    expect(entering).toHaveBeenCalled();
  });
});
