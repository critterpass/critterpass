import { render, screen } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';

import { GuideSpriteSlot } from '../GuideSpriteSlot';

describe('GuideSpriteSlot', () => {
  it('passes the compass heading through to its render-prop child', async () => {
    await render(
      <GuideSpriteSlot heading={187}>
        {(heading) => <Text>{`heading:${String(heading)}`}</Text>}
      </GuideSpriteSlot>,
    );
    expect(screen.getByText('heading:187')).toBeTruthy();
    expect(screen.getByTestId('guide-sprite-slot')).toBeTruthy();
  });
});
