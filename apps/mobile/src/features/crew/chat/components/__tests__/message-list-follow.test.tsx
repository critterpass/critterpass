// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { act, fireEvent, screen } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';

import { renderUi } from '@/ui/test-support/render';

import { scrollToEndCalls } from '../../test-support/flash-list-double';
import { MessageList } from '../message-list';
import type { TimelineRow } from '../timeline-rows';

const ROWS: TimelineRow[] = [{ kind: 'day', key: 'd-2026-10-02', day: '2026-10-02' }];

/** The list's viewport is 390 pt tall; `content` is how tall the conversation in it is. */
function scrollEvent(y: number, content: number) {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y },
      layoutMeasurement: { width: 390, height: 390 },
      contentSize: { width: 390, height: content },
    },
  };
}

async function renderList() {
  await renderUi(
    <MessageList
      rows={ROWS}
      today="2026-10-02"
      renderMessage={() => <Text>message</Text>}
      onLoadOlder={() => undefined}
      onSeenLatest={() => undefined}
    />,
  );
  return screen.getByTestId('chat-list');
}

beforeEach(() => {
  scrollToEndCalls.length = 0;
});

describe('chat message list', () => {
  it('keeps the newest message in view as the conversation grows while the member is at the end', async () => {
    const list = await renderList();
    await act(async () => {
      await fireEvent(list, 'contentSizeChange', 390, 720);
    });
    expect(scrollToEndCalls).toHaveLength(1);
  });

  it('leaves a member who started scrolling back where they are when the conversation changes', async () => {
    const list = await renderList();
    // At the end, then the member takes hold of the list to read back.
    await act(async () => {
      await fireEvent.scroll(list, scrollEvent(330, 720));
      await fireEvent(list, 'scrollBeginDrag', scrollEvent(330, 720));
    });
    // A message settles (its "sending" line goes) before the first scroll event of the drag.
    await act(async () => {
      await fireEvent(list, 'contentSizeChange', 390, 700);
    });
    expect(scrollToEndCalls).toHaveLength(0);
    // Back at the end, the list follows the conversation again.
    await act(async () => {
      await fireEvent.scroll(list, scrollEvent(310, 700));
      await fireEvent(list, 'contentSizeChange', 390, 760);
    });
    expect(scrollToEndCalls).toHaveLength(1);
  });
});
