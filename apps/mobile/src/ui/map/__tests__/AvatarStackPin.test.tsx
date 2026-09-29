import { screen } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { AvatarStackPin } from '../AvatarStackPin';

describe('AvatarStackPin', () => {
  it('renders up to 3 avatars with no overflow badge', async () => {
    await renderWithI18n(
      <AvatarStackPin
        members={[
          { id: 'a', initial: 'A' },
          { id: 'b', initial: 'B' },
        ]}
      />,
    );
    expect(screen.getByTestId('avatar-stack-pin-avatar-a')).toBeTruthy();
    expect(screen.getByTestId('avatar-stack-pin-avatar-b')).toBeTruthy();
    expect(screen.queryByTestId('avatar-stack-pin-overflow')).toBeNull();
    expect(screen.getByLabelText('A, B here')).toBeTruthy();
  });

  it('shows a "+N" overflow badge for a pin with more than 3 avatars', async () => {
    await renderWithI18n(
      <AvatarStackPin
        members={[
          { id: 'a', initial: 'A' },
          { id: 'b', initial: 'B' },
          { id: 'c', initial: 'C' },
          { id: 'd', initial: 'D' },
          { id: 'e', initial: 'E' },
        ]}
      />,
    );
    expect(screen.getByTestId('avatar-stack-pin-avatar-a')).toBeTruthy();
    expect(screen.getByTestId('avatar-stack-pin-avatar-b')).toBeTruthy();
    expect(screen.getByTestId('avatar-stack-pin-avatar-c')).toBeTruthy();
    expect(screen.queryByTestId('avatar-stack-pin-avatar-d')).toBeNull();
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getByLabelText('A, B, C, D, E, and 2 more here')).toBeTruthy();
  });
});
