/**
 * An avatar given a member's user id draws the face that member chose, through the provider at the
 * app root; without an id, without a chosen face or outside the provider it keeps the initial.
 */

import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { renderUi } from '../../test-support/render';
import { Avatar } from '../Avatar';
import { AvatarStack } from '../AvatarStack';
import { MemberFaceProvider, type MemberFaceResolver } from '../member-face';

/** Maya wears a critter, Ari a photo; nobody else has chosen a face. */
const resolve: MemberFaceResolver = (uid, diameter) => {
  if (uid === 'u-maya') return { critter: <View testID={`maya-critter-${String(diameter)}`} /> };
  if (uid === 'u-ari') return { photo: { uri: 'https://media.test/ari.jpg' } };
  return {};
};

function withFaces(node: ReactElement) {
  return <MemberFaceProvider resolve={resolve}>{node}</MemberFaceProvider>;
}

describe('an avatar by user id', () => {
  it('draws the critter the member chose, sized for the avatar, in place of the initial', async () => {
    await renderUi(withFaces(<Avatar name="Maya" uid="u-maya" size="sm" />));
    expect(screen.getByTestId(/^maya-critter-\d+$/u)).toBeTruthy();
    expect(screen.queryByText('M')).toBeNull();
  });

  it('draws the photo the member chose', async () => {
    await renderUi(withFaces(<Avatar name="Ari" uid="u-ari" testID="ari" />));
    expect(screen.getByTestId('ari-photo').props.source).toEqual({
      uri: 'https://media.test/ari.jpg',
    });
    expect(screen.queryByText('A')).toBeNull();
  });

  it('keeps the initial for a member with no chosen face, and for an avatar with no id', async () => {
    await renderUi(
      withFaces(
        <>
          <Avatar name="Jun" uid="u-jun" />
          <Avatar name="Maya" />
        </>,
      ),
    );
    expect(screen.getByText('J')).toBeTruthy();
    expect(screen.getByText('M')).toBeTruthy();
  });

  it('keeps the initial where no one provides faces', async () => {
    await renderUi(<Avatar name="Maya" uid="u-maya" />);
    expect(screen.getByText('M')).toBeTruthy();
  });

  it('lets a face handed in directly win over the chosen one', async () => {
    await renderUi(
      withFaces(<Avatar name="Maya" uid="u-maya" critter={<View testID="handed-in" />} />),
    );
    expect(screen.getByTestId('handed-in')).toBeTruthy();
    expect(screen.queryByTestId(/^maya-critter/u)).toBeNull();
  });

  it('draws chosen faces in a stack too', async () => {
    await renderUi(
      withFaces(
        <AvatarStack
          members={[
            { key: 'a', name: 'Maya', uid: 'u-maya', joinIndex: 0 },
            { key: 'b', name: 'Jun', uid: 'u-jun', joinIndex: 1 },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId(/^maya-critter-\d+$/u, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('J', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('M', { includeHiddenElements: true })).toBeNull();
  });
});
