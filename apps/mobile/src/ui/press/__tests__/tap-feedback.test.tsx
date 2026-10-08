/**
 * Shared controls answer a tap themselves, through the feedback bus: a segment or a toggle snaps,
 * a chip ticks. A host that fires its own cue for the tap is never doubled, and a host can turn
 * the control's cue off. The phone's haptic engine is the boundary.
 */
jest.mock('@/motion/impact', () => {
  const actual = jest.requireActual('@/motion/impact');
  return { ...(actual as object), impact: jest.fn() };
});
jest.mock('../../../../modules/cp-haptics', () => ({ play: jest.fn() }));

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { feedback } from '@/motion';
import { impact as fireHaptic } from '@/motion/impact';
import { resetFeedbackPrefsForTests } from '@/motion/test-support/reset-feedback-prefs';

import { ChoiceChip } from '../../chips/ChoiceChip';
import { FilterChip } from '../../chips/FilterChip';
import { Segmented } from '../../inputs/Segmented';
import { Toggle } from '../../inputs/Toggle';
import { renderUi } from '../../test-support/render';

const haptic = fireHaptic as jest.MockedFunction<typeof fireHaptic>;
const fired = () => haptic.mock.calls.map(([cue]) => cue);
const ACTIVATE = { nativeEvent: { actionName: 'activate' } };
const activate = (testID: string) =>
  fireEvent(screen.getByTestId(testID), 'accessibilityAction', ACTIVATE);

const SEGMENTS = [
  { value: 'story', label: 'Story' },
  { value: 'post', label: 'Post' },
] as const;

beforeEach(async () => {
  jest.clearAllMocks();
  await resetFeedbackPrefsForTests();
});

describe('tap feedback from shared controls', () => {
  it('snaps when the segment changes, and stays silent on the one already chosen', async () => {
    const onChange = jest.fn();
    await renderUi(
      <Segmented label="Shape" segments={SEGMENTS} value="story" onChange={onChange} />,
    );
    await fireEvent(screen.getByLabelText('Post'), 'accessibilityAction', ACTIVATE);
    expect(onChange).toHaveBeenCalledWith('post');
    expect(fired()).toEqual(['snap']);
    await fireEvent(screen.getByLabelText('Story'), 'accessibilityAction', ACTIVATE);
    expect(fired()).toEqual(['snap']);
  });

  it('snaps on a toggle and ticks on chips', async () => {
    await renderUi(
      <>
        <Toggle label="Sound" value={false} onValueChange={() => undefined} testID="toggle" />
        <ChoiceChip label="Beach" selected={false} onPress={() => undefined} testID="choice" />
        <FilterChip label="Open now" selected={false} onPress={() => undefined} testID="filter" />
      </>,
    );
    await activate('toggle');
    await activate('choice');
    await activate('filter');
    expect(fired()).toEqual(['snap', 'tick', 'tick']);
  });

  it('leaves the tap to a host that fires its own cue', async () => {
    await renderUi(
      <ChoiceChip
        label="Beach"
        selected={false}
        onPress={() => feedback.emit('success')}
        testID="choice"
      />,
    );
    await activate('choice');
    expect(fired()).toEqual(['success']);
  });

  it('stays silent when the host turns the cue off', async () => {
    await renderUi(
      <>
        <Toggle
          label="Sound"
          value={false}
          onValueChange={() => undefined}
          feedback={false}
          testID="toggle"
        />
        <FilterChip
          label="Open now"
          selected={false}
          onPress={() => undefined}
          feedback={false}
          testID="filter"
        />
      </>,
    );
    await activate('toggle');
    await activate('filter');
    expect(fired()).toEqual([]);
  });
});
