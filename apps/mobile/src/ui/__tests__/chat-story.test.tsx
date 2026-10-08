import { act, fireEvent, screen } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';

import { ChatRichCard } from '../chat/ChatRichCard';
import { Composer } from '../chat/Composer';
import { ReactionFloats } from '../chat/ReactionFloats';
import { StoryPlayer } from '../story/StoryPlayer';
import { renderUi } from '../test-support/render';

const run = (node: ReturnType<typeof screen.getByRole>, actionName: string) =>
  fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('chat', () => {
  it('votes in a chat poll and reads the typing indicator', async () => {
    const onVote = jest.fn();
    await renderUi(
      <>
        <ChatRichCard
          kind="poll"
          title="Spa on day 3?"
          onVote={onVote}
          options={[
            { id: 'yes', label: 'Yes', votes: 3, mine: true },
            { id: 'no', label: 'No', votes: 0 },
          ]}
        />
        <ChatRichCard kind="typing" name="Tokek" />
        <ChatRichCard
          kind="expense"
          title="Maya paid for lunch"
          actionLabel="View"
          onOpen={() => undefined}
        />
      </>,
    );
    expect(
      screen.getByRole('button', { name: 'Yes, 3 votes, your vote' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await run(screen.getByRole('button', { name: 'No, 0 votes' }), 'activate');
    expect(onVote).toHaveBeenCalledWith('no');
    expect(screen.getByLabelText('Tokek is typing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View, Maya paid for lunch' })).toBeTruthy();
  });

  it('keeps only the newest reactions and reads them', async () => {
    await renderUi(
      <ReactionFloats
        max={2}
        reactions={[
          { id: '1', author: 'Maya', text: 'okay wow' },
          { id: '2', author: 'Jordan', text: '6AM??' },
          { id: '3', author: 'Alex', text: "I'm in" },
        ]}
      />,
    );
    expect(screen.getByLabelText("Reactions: Jordan: 6AM??; Alex: I'm in")).toBeTruthy();
  });

  it('records by mic tap as the hold-to-talk alternative and sends typed text', async () => {
    const onMicTap = jest.fn();
    const onSend = jest.fn();
    const props = {
      onChangeText: () => undefined,
      onSend,
      placeholder: 'Message',
      onMicTap,
      onHoldStart: () => undefined,
    };
    const { rerender } = await renderUi(<Composer {...props} value="" />);
    await run(screen.getByRole('button', { name: 'Record a voice message' }), 'activate');
    expect(onMicTap).toHaveBeenCalledTimes(1);
    await rerender(<Composer {...props} value="" recording />);
    expect(
      screen.getByRole('button', { name: 'Stop and send voice message' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await rerender(<Composer {...props} value="sunset?" />);
    await run(screen.getByRole('button', { name: 'Send' }), 'activate');
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe('story', () => {
  const segments = [
    { id: 'a', label: 'Gates at dawn', caption: 'Worth the alarm.', content: null },
    { id: 'b', label: 'Bamboo', content: null },
  ];

  it('pauses with the slide’s pause action, then advances and announces the next slide', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onIndexChange = jest.fn();
    await renderUi(<StoryPlayer segments={segments} onIndexChange={onIndexChange} />);
    expect(screen.getByRole('adjustable', { name: 'Slide 1 of 2. Gates at dawn' })).toBeTruthy();
    expect(screen.getByText('Worth the alarm.')).toBeTruthy();

    await run(screen.getByRole('adjustable'), 'activate');
    await act(() => jest.advanceTimersByTime(6000));
    expect(onIndexChange).not.toHaveBeenCalled();

    await run(screen.getByRole('adjustable'), 'activate');
    await act(() => jest.advanceTimersByTime(5000));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(announce).toHaveBeenCalledWith('Bamboo');
    expect(screen.getByRole('adjustable', { name: 'Slide 2 of 2. Bamboo' })).toBeTruthy();
  });

  it('holds while the screen holds it, then carries on from where it stopped', async () => {
    jest.useFakeTimers();
    const onIndexChange = jest.fn();
    const ui = (held: boolean) => (
      <StoryPlayer segments={segments} held={held} onIndexChange={onIndexChange} />
    );
    const { rerender } = await renderUi(ui(false));
    await act(() => jest.advanceTimersByTime(2000));

    await rerender(ui(true));
    await act(() => jest.advanceTimersByTime(20_000));
    expect(onIndexChange).not.toHaveBeenCalled();

    // Let go, the slide has the three seconds it had left, not a jump to the next one.
    await rerender(ui(false));
    await act(() => jest.advanceTimersByTime(2500));
    expect(onIndexChange).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1000));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('steps slides with adjustable actions and finishes after the last', async () => {
    const onFinished = jest.fn();
    await renderUi(<StoryPlayer segments={segments} onFinished={onFinished} />);
    await run(screen.getByRole('adjustable'), 'increment');
    expect(screen.getByRole('adjustable', { name: 'Slide 2 of 2. Bamboo' })).toBeTruthy();
    await run(screen.getByRole('adjustable'), 'decrement');
    expect(screen.getByRole('adjustable', { name: 'Slide 1 of 2. Gates at dawn' })).toBeTruthy();
    await run(screen.getByRole('adjustable'), 'increment');
    await run(screen.getByRole('adjustable'), 'increment');
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
