/**
 * The timeline without dragging: a screen reader's adjustable actions move a block 15 minutes at
 * a time (pushing the next block in its lane along), extend or shorten it by 15, and a booked
 * block offers none of them; every step commits as plan ops the same way a drop does.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, within } from '@testing-library/react-native';

import type { PlanOp } from '@cp/domain';

import { renderUi } from '@/ui/test-support/render';

import { DINNER, LAB_DATE, LAB_TZ, WALK as LAB_WALK } from '../../day/dev/lab-fixtures';
import { instantOnDay, type DayItem } from '../../day/plan-model';
import { TimelineEditor } from '../timeline-editor';

// A 75-minute walk right before a coffee that starts as it ends.
const WALK: DayItem = { ...LAB_WALK, start: 14 * 60, end: 15 * 60 + 15 };

const COFFEE: DayItem = {
  ...WALK,
  stableId: 'i-coffee',
  title: 'Coffee',
  start: 15 * 60 + 15,
  end: 15 * 60 + 45,
  category: 'cafe',
};

async function timeline(onCommit: (ops: readonly PlanOp[]) => void) {
  await renderUi(
    <TimelineEditor
      items={[WALK, COFFEE, DINNER]}
      day={{ dayNo: 3, date: LAB_DATE }}
      members={[]}
      meta={() => ''}
      pending={() => false}
      editable
      onOpen={() => undefined}
      onCommit={onCommit}
    />,
  );
  await fireEvent(screen.getByTestId('plan-timeline'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 350, height: 600 } },
  });
}

const at = (minutes: number) => instantOnDay(LAB_DATE, minutes, LAB_TZ);
const step = (id: string, actionName: string) =>
  fireEvent(screen.getByTestId(`timeline-block-${id}`), 'accessibilityAction', {
    nativeEvent: { actionName },
  });

describe('timeline screen-reader actions', () => {
  it('moves a block 15 minutes later and pushes the next one in its lane', async () => {
    const onCommit = jest.fn<(ops: readonly PlanOp[]) => void>();
    await timeline(onCommit);
    await step('i-walk', 'increment');
    expect(onCommit).toHaveBeenCalledWith([
      {
        op: 'move',
        item: 'i-walk',
        new: { starts_at: at(14 * 60 + 15), ends_at: at(15 * 60 + 30) },
      },
      { op: 'move', item: 'i-coffee', new: { starts_at: at(15 * 60 + 30), ends_at: at(16 * 60) } },
    ]);
  });

  it('moves earlier, extends and shortens by 15 minutes', async () => {
    const onCommit = jest.fn<(ops: readonly PlanOp[]) => void>();
    await timeline(onCommit);
    await step('i-walk', 'decrement');
    await step('i-coffee', 'extend');
    await step('i-coffee', 'shorten');
    expect(onCommit.mock.calls.map(([ops]) => ops[0])).toEqual([
      { op: 'move', item: 'i-walk', new: { starts_at: at(13 * 60 + 45), ends_at: at(15 * 60) } },
      {
        op: 'resize',
        item: 'i-coffee',
        new: { starts_at: at(15 * 60 + 15), ends_at: at(16 * 60) },
      },
      // The extend is still showing (not synced yet), so shorten works from 16:00.
      {
        op: 'resize',
        item: 'i-coffee',
        new: { starts_at: at(15 * 60 + 15), ends_at: at(15 * 60 + 45) },
      },
    ]);
  });

  it("keeps a block's resize handles beside its screen-reader element, not inside it", async () => {
    await timeline(() => undefined);
    // iOS folds an accessible view's children into it: handles inside would be out of reach.
    const walk = screen.getByTestId('timeline-block-i-walk');
    expect(within(walk).queryByTestId('timeline-block-i-walk-bottom')).toBeNull();
    expect(screen.getByTestId('timeline-block-i-walk-bottom')).toBeTruthy();
  });

  it('offers no moves on a booked block', async () => {
    await timeline(() => undefined);
    const dinner = screen.getByTestId('timeline-block-i-dinner');
    const actions = dinner.props.accessibilityActions as readonly { readonly name: string }[];
    expect(actions.map((action) => action.name)).toEqual(['activate']);
  });
});
