/**
 * The guide beside the meet-up pin: once its picture is drawn, the picture itself is the element a
 * screen reader (and the iPhone hierarchy) finds, named after the guide. Inside an accessible
 * wrapper it was folded away on iOS, so nothing could tell the picture had arrived.
 */

import { describe, expect, it } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react-native';

import { guideSticker } from '@/ui/avatar/guides';

import { GuideImage } from '../map/guide-image';

const PNG = new Uint8Array([137, 80, 78, 71]);

describe('guide beside the meet-up pin', () => {
  it('is its drawn picture, named after the guide, not a wrapper around it', async () => {
    const guide = guideSticker('tokek');
    await render(<GuideImage guide={guide} size={44} render={() => Promise.resolve(PNG)} />);

    await waitFor(() => expect(screen.getByTestId('live-guide-tokek-image')).toBeTruthy());
    const wrapper = screen.getByTestId('live-guide-tokek');
    expect(wrapper.props.accessible).toBeFalsy();
    const picture = within(wrapper).getByTestId('live-guide-tokek-image');
    expect(picture.props.accessible).toBe(true);
    expect(picture.props.accessibilityLabel).toBe(guide.name);
  });
});
