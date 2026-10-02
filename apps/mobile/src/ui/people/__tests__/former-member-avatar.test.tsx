/** An erased member's avatar is a plain circle read as "Former member", never an empty initial. */
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';

import { renderUi } from '../../test-support/render';
import { Avatar } from '../Avatar';

describe('a former member’s avatar', () => {
  it('has no initial and is labelled "Former member"', async () => {
    await renderUi(<Avatar name="" testID="gone" />);
    expect(screen.getByTestId('gone').props.accessibilityLabel).toBe('Former member');
    expect(screen.queryByText(/./u)).toBeNull();
  });

  it('keeps the initial of someone still here', async () => {
    await renderUi(<Avatar name="Maya" testID="maya" />);
    expect(screen.getByTestId('maya').props.accessibilityLabel).toBe('Maya');
    expect(screen.getByText('M')).toBeTruthy();
  });
});
