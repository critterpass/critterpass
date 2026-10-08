/**
 * A generic photo (stock standing in for the place) never passes for the place: a row's small
 * picture takes the corner mark, a card's picture the "Not this place" line, the place's own photo
 * neither, and a photo that did not load leaves the plain category tile.
 */

import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import { renderUi } from '@/ui/test-support/render';

import { PlaceCard } from '../place-card';
import { PlaceRow } from '../place-row';
import { PlaceThumb } from '../place-thumb';

const PHOTO = { uri: 'https://media.staging.critterpass.app/c/media/a/480.webp' };

// The picture is decoration for screen readers (the row carries the words), so it is hidden.
const HIDDEN = { includeHiddenElements: true };

const load = () => fireEvent(screen.getByTestId('place-thumb-photo', HIDDEN), 'load');

describe('PlaceThumb with a generic photo', () => {
  it.each([28, 38, 44, 56])('marks a %i pt picture in the corner, without words', async (size) => {
    await renderUi(<PlaceThumb photo={PHOTO} genericPhoto size={size} />);
    await load();
    expect(screen.getByTestId('place-thumb-generic-mark', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('place-thumb-generic-label', HIDDEN)).toBeNull();
    expect(screen.queryByText('Not this place', HIDDEN)).toBeNull();
  });

  it('says "Not this place" on a card’s 92 pt picture', async () => {
    await renderUi(<PlaceCard title="Tegallalang" photo={PHOTO} genericPhoto />);
    await load();
    expect(screen.getByText('Not this place', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('place-thumb-generic-mark', HIDDEN)).toBeNull();
  });

  it('marks a list row’s picture (56 pt) and an Ideas row’s (38 pt)', async () => {
    const view = await renderUi(<PlaceRow title="Seniman" photo={PHOTO} genericPhoto />);
    await load();
    expect(screen.getByTestId('place-thumb-generic-mark', HIDDEN)).toBeTruthy();
    await view.rerender(<PlaceRow title="Seniman" photo={PHOTO} genericPhoto saversAtEnd />);
    expect(screen.getByTestId('place-thumb-generic-mark', HIDDEN)).toBeTruthy();
  });

  it('shows the place’s own photo with no mark and no line', async () => {
    await renderUi(<PlaceRow title="Tirta Empul" photo={PHOTO} />);
    await load();
    expect(screen.getByTestId('place-thumb-photo', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('place-thumb-generic-mark', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('place-thumb-generic-label', HIDDEN)).toBeNull();
  });

  it('keeps the mark off until the photo is on screen', async () => {
    await renderUi(<PlaceThumb photo={PHOTO} genericPhoto size={56} />);
    expect(screen.queryByTestId('place-thumb-generic-mark', HIDDEN)).toBeNull();
  });

  it('falls back to the category tile when the photo does not load', async () => {
    await renderUi(<PlaceThumb photo={PHOTO} genericPhoto icon="food" size={56} />);
    await fireEvent(screen.getByTestId('place-thumb-photo', HIDDEN), 'error');
    expect(screen.queryByTestId('place-thumb-photo', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('place-thumb-generic-mark', HIDDEN)).toBeNull();
  });
});
