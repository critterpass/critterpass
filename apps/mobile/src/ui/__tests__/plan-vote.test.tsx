import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { DayRow } from '../plan/DayRow';
import { DayTimeline } from '../plan/DayTimeline';
import { renderUi } from '../test-support/render';
import { IdeaVoteBox } from '../vote/IdeaVoteBox';

const act = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
const { color } = tokens;

describe('planning', () => {
  it('reorders a day with move actions and opens it on activate', async () => {
    const onReorder = jest.fn();
    const onPress = jest.fn();
    await renderUi(
      <DayRow
        dayNumber={2}
        weekday="Tue"
        title="Ubud centre"
        statusLabel="1 vote"
        onPress={onPress}
        reorder={{ index: 1, count: 3, rowHeight: 80, onReorder }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Day 2, Tue, Ubud centre, 1 vote' });
    const actions = row.props.accessibilityActions as readonly { readonly label: string }[];
    expect(actions.map((a) => a.label)).toEqual(expect.arrayContaining(['Move up', 'Move down']));
    await act(row, 'moveUp');
    await act(row, 'moveDown');
    expect(onReorder.mock.calls).toEqual([
      [1, 0],
      [1, 2],
    ]);
    await act(row, 'activate');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('moves a timeline block by the visible stepper and by adjustable actions', async () => {
    const onMove = jest.fn();
    const onAccept = jest.fn();
    await renderUi(
      <DayTimeline
        blocks={[
          { id: 'walk', title: 'Ridge walk', start: 840, end: 900, color: color.yellow },
          { id: 'old', title: 'Old walk', start: 600, end: 660, color: color.pink, struck: true },
        ]}
        rain={{ start: 780, end: 900, label: 'Rain' }}
        ghost={{ title: 'Ridge walk', start: 1020, end: 1080, color: color.yellow, onAccept }}
        onMove={onMove}
      />,
    );
    const block = screen.getByRole('adjustable', { name: 'Ridge walk' });
    expect(block.props.accessibilityValue).toEqual({ text: '2:00 PM–3:00 PM' });
    expect(screen.queryByRole('adjustable', { name: 'Old walk' })).toBeNull();
    expect(screen.getByLabelText('Was here, Old walk, 10:00 AM–11:00 AM')).toBeTruthy();

    await act(block, 'increment');
    expect(onMove).toHaveBeenLastCalledWith('walk', 855);

    expect(screen.queryByRole('button', { name: 'Later by 15 minutes' })).toBeNull();
    await act(block, 'activate');
    await act(screen.getByRole('button', { name: 'Earlier by 15 minutes' }), 'activate');
    expect(onMove).toHaveBeenLastCalledWith('walk', 825);

    await act(
      screen.getByRole('button', { name: 'Suggestion: Ridge walk, 5:00 PM. Accept' }),
      'activate',
    );
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

describe('voting', () => {
  it('toggles an idea vote', async () => {
    const onToggle = jest.fn();
    await renderUi(
      <>
        <IdeaVoteBox count={412} voted onToggle={onToggle} ideaTitle="Packing lists" />
      </>,
    );
    const box = screen.getByRole('button', { name: 'Upvote Packing lists' });
    expect(box.props.accessibilityValue).toEqual({ text: '412 votes' });
    expect(box.props.accessibilityState).toMatchObject({ selected: true });
    await act(box, 'activate');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
