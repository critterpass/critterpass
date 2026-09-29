// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));

import { act, fireEvent, screen } from '@testing-library/react-native';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AccessibilityInfo } from 'react-native';

import { AttachmentThumb } from '../chat/AttachmentThumb';
import { ChatMessage } from '../chat/ChatMessage';
import { ChatRichCard } from '../chat/ChatRichCard';
import { Composer } from '../chat/Composer';
import { FormatPicker } from '../chat/FormatPicker';
import { ReactionFloats } from '../chat/ReactionFloats';
import { PageDots } from '../story/PageDots';
import { StepTabs } from '../story/StepTabs';
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
  it('reads who said what and exposes the message menu as actions', async () => {
    const onReply = jest.fn();
    await renderUi(
      <>
        <ChatMessage kind="divider" text="Today" />
        <ChatMessage
          kind="theirs"
          author="Maya"
          text="spa on day 3?"
          actions={[{ id: 'reply', label: 'Reply', onPress: onReply }]}
        />
        <ChatMessage kind="mine" text="count me in" />
      </>,
    );
    expect(screen.getByRole('header')).toBeTruthy();
    const theirs = screen.getByRole('text', { name: 'Maya: spa on day 3?' });
    expect(theirs.props.accessibilityActions).toEqual([{ name: 'reply', label: 'Reply' }]);
    await run(theirs, 'reply');
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('count me in')).toBeTruthy();
  });

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

  it('picks a format and removes or adds attachments', async () => {
    const onChange = jest.fn();
    const onRemove = jest.fn();
    const onAdd = jest.fn();
    await renderUi(
      <>
        <FormatPicker
          label="Format"
          value="trailer"
          onChange={onChange}
          options={[
            { value: 'trailer', label: 'Trailer', preview: null },
            { value: 'poster', label: 'Poster', preview: null },
          ]}
        />
        <AttachmentThumb preview={null} label="Screenshot" onRemove={onRemove} />
        <AttachmentThumb onAdd={onAdd} />
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Trailer' }).props.accessibilityState).toMatchObject({
      checked: true,
    });
    await run(screen.getByRole('radio', { name: 'Poster' }), 'activate');
    expect(onChange).toHaveBeenCalledWith('poster');
    await run(screen.getByRole('button', { name: 'Remove Screenshot' }), 'activate');
    await run(screen.getByRole('button', { name: 'Add attachment' }), 'activate');
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
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

  it('pauses with the visible pause button, then advances and announces the next slide', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onIndexChange = jest.fn();
    await renderUi(<StoryPlayer segments={segments} onIndexChange={onIndexChange} />);
    expect(screen.getByRole('adjustable', { name: 'Slide 1 of 2. Gates at dawn' })).toBeTruthy();
    expect(screen.getByText('Worth the alarm.')).toBeTruthy();

    await run(screen.getByRole('button', { name: 'Pause' }), 'activate');
    await act(() => jest.advanceTimersByTime(6000));
    expect(onIndexChange).not.toHaveBeenCalled();

    await run(screen.getByRole('button', { name: 'Play' }), 'activate');
    await act(() => jest.advanceTimersByTime(5000));
    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(announce).toHaveBeenCalledWith('Bamboo');
    expect(screen.getByRole('adjustable', { name: 'Slide 2 of 2. Bamboo' })).toBeTruthy();
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

  it('reads wizard steps as tabs and the pager as a page count', async () => {
    const onSelect = jest.fn();
    await renderUi(
      <>
        <StepTabs
          current={1}
          onSelect={onSelect}
          steps={[{ label: 'When', done: true }, { label: 'Budget' }]}
        />
        <PageDots page={3} total={4} />
      </>,
    );
    const done = screen.getByRole('tab', { name: 'Step 1 of 2, When, done' });
    expect(
      screen.getByRole('tab', { name: 'Step 2 of 2, Budget' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    await run(done, 'activate');
    expect(onSelect).toHaveBeenCalledWith(0);
    expect(screen.getByRole('text', { name: 'Page 3 of 4' })).toBeTruthy();
  });
});
