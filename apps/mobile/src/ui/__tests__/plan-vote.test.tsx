// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));

import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { Icon } from '../icons/Icon';
import { DayRow } from '../plan/DayRow';
import { DayTimeline } from '../plan/DayTimeline';
import { DiffRow } from '../plan/DiffRow';
import { RoomAssign } from '../plan/RoomAssign';
import { renderUi } from '../test-support/render';
import { IdeaVoteBox } from '../vote/IdeaVoteBox';
import { MoodPicker } from '../vote/MoodPicker';
import { RateStack } from '../vote/RateStack';
import { SplitShowdown } from '../vote/SplitShowdown';
import { SwipeStack } from '../vote/SwipeStack';
import { VoteBoard } from '../vote/VoteBoard';

const act = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
const { color } = tokens;
const cards = [
  { id: 'tirta', label: 'Tirta Empul', content: null },
  { id: 'goa', label: 'Goa Gajah', content: null },
];

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

  it('keeps or rejects a change with toggle buttons', async () => {
    const onKeep = jest.fn();
    const onReject = jest.fn();
    await renderUi(
      <DiffRow
        before="14:00 Ridge walk"
        after="17:00 Ridge walk"
        reason="Rain clears by 3."
        decision="kept"
        onKeep={onKeep}
        onReject={onReject}
      />,
    );
    expect(
      screen.getByLabelText(
        'Changed from 14:00 Ridge walk to 17:00 Ridge walk, Rain clears by 3., Kept',
      ),
    ).toBeTruthy();
    const keep = screen.getByRole('button', { name: 'Keep this change' });
    expect(keep.props.accessibilityState).toMatchObject({ selected: true });
    await act(screen.getByRole('button', { name: 'Reject this change' }), 'activate');
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('moves a person between rooms without dragging', async () => {
    const onMove = jest.fn();
    await renderUi(
      <RoomAssign
        onMove={onMove}
        rooms={[
          { id: 'r1', name: 'Room 1', occupants: [{ id: 'm', name: 'Maya', avatar: null }] },
          { id: 'r2', name: 'Room 2', occupants: [] },
        ]}
      />,
    );
    await act(screen.getByRole('button', { name: 'Move Maya' }), 'activate');
    await act(screen.getByRole('button', { name: 'Move Maya to Room 2' }), 'activate');
    expect(onMove).toHaveBeenCalledWith('m', 'r2');
    expect(screen.queryByRole('button', { name: 'Move Maya to Room 2' })).toBeNull();
  });
});

describe('voting', () => {
  it('votes from the board and the showdown halves', async () => {
    const onVote = jest.fn();
    await renderUi(
      <>
        <VoteBoard
          title="Where next?"
          onVote={onVote}
          options={[
            { id: 'kyoto', name: 'Kyoto', votes: 3, mine: true, sticker: <Icon name="temple" /> },
          ]}
        />
        <SplitShowdown
          onVote={onVote}
          sides={[
            { id: 'kyoto', name: 'Kyoto', color: color.orange, votes: 3, mine: true },
            { id: 'lisbon', name: 'Lisbon', color: color.blue, votes: 1 },
          ]}
        />
      </>,
    );
    const mine = screen.getAllByRole('button', { name: 'Kyoto, 3 votes, your vote' });
    expect(mine).toHaveLength(2);
    expect(mine[0]?.props.accessibilityState).toMatchObject({ selected: true });
    await act(screen.getByRole('button', { name: 'Lisbon, 1 vote' }), 'activate');
    expect(onVote).toHaveBeenCalledWith('lisbon');
  });

  it('answers the swipe deck with buttons and with swipe actions', async () => {
    const onAnswer = jest.fn();
    await renderUi(<SwipeStack cards={cards} onAnswer={onAnswer} />);
    await act(screen.getByRole('button', { name: 'Yes to Tirta Empul' }), 'activate');
    await act(screen.getByRole('button', { name: 'No to Tirta Empul' }), 'activate');
    const card = screen.getByRole('adjustable', { name: 'Tirta Empul' });
    await act(card, 'swipeLeft');
    await act(card, 'swipeRight');
    expect(onAnswer.mock.calls).toEqual([
      ['tirta', 'yes'],
      ['tirta', 'no'],
      ['tirta', 'no'],
      ['tirta', 'yes'],
    ]);
  });

  it('rates with three buttons and with swipe actions', async () => {
    const onRate = jest.fn();
    await renderUi(<RateStack cards={cards} onRate={onRate} />);
    await act(screen.getByRole('button', { name: 'Fine' }), 'activate');
    await act(screen.getByRole('button', { name: 'Loved it' }), 'activate');
    await act(screen.getByRole('adjustable', { name: 'Tirta Empul' }), 'swipeLeft');
    expect(onRate.mock.calls).toEqual([
      ['tirta', 'fine'],
      ['tirta', 'loved'],
      ['tirta', 'skip'],
    ]);
  });

  it('toggles an idea vote and picks a mood as a radio', async () => {
    const onToggle = jest.fn();
    const onChange = jest.fn();
    await renderUi(
      <>
        <IdeaVoteBox count={412} voted onToggle={onToggle} ideaTitle="Packing lists" />
        <MoodPicker
          label="How's it going?"
          value="good"
          onChange={onChange}
          options={[
            { value: 'meh', label: 'Meh', sticker: null },
            { value: 'good', label: 'Good', sticker: null },
          ]}
        />
      </>,
    );
    const box = screen.getByRole('button', { name: 'Upvote Packing lists' });
    expect(box.props.accessibilityValue).toEqual({ text: '412 votes' });
    expect(box.props.accessibilityState).toMatchObject({ selected: true });
    await act(box, 'activate');
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Good' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    await act(screen.getByRole('radio', { name: 'Meh' }), 'activate');
    expect(onChange).toHaveBeenCalledWith('meh');
  });
});
