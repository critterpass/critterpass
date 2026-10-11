import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { ThemeProvider } from '../../../lib/theme';
import { setUiQaSink } from '../../qa/ui-qa';
import { Text } from '../text/Text';

let reports: string[] = [];
beforeEach(() => {
  reports = [];
  setUiQaSink((line) => reports.push(line));
});
afterEach(() => setUiQaSink(null));

function lines(...texts: string[]) {
  return { nativeEvent: { lines: texts.map((text) => ({ text })) } };
}

async function layOut(ui: ReactElement, laid: ReturnType<typeof lines>, fontScale = 1) {
  const screen = await renderWithI18n(<ThemeProvider fontScale={fontScale}>{ui}</ThemeProvider>, {
    locale: 'en',
  });
  await fireEvent(screen.getByTestId('t'), 'textLayout', laid);
}

describe('premium Text layout checks', () => {
  it('reports a control label that wrapped at the default text size', async () => {
    await layOut(
      <Text testID="t" variant="button">
        Book the boat
      </Text>,
      lines('Book the ', 'boat'),
    );
    expect(reports).toEqual(['[ui-qa] TEXT_WRAPPED "t" button']);
  });

  it('lets a label the design sets on two lines opt out of the wrap check', async () => {
    await layOut(
      <Text testID="t" variant="button" singleLine={false}>
        Book the boat
      </Text>,
      lines('Book the ', 'boat'),
    );
    expect(reports).toEqual([]);
  });

  it('lets labels wrap at larger text sizes, and body copy wrap at any size', async () => {
    await layOut(
      <Text testID="t" variant="button">
        Book the boat
      </Text>,
      lines('Book the ', 'boat'),
      1.4,
    );
    await layOut(
      <Text testID="t" variant="body">
        Rain after three on Saturday
      </Text>,
      lines('Rain after three ', 'on Saturday'),
    );
    expect(reports).toEqual([]);
  });

  it('reports a control label its line limit cut, but not a row title cut on purpose', async () => {
    await layOut(
      <Text testID="t" variant="segment" numberOfLines={1}>
        Whole trip
      </Text>,
      lines('Whole t'),
    );
    await layOut(
      <Text testID="t" variant="rowTitle" numberOfLines={1}>
        Sunset at Uluwatu temple
      </Text>,
      lines('Sunset at Ulu'),
    );
    expect(reports).toEqual(['[ui-qa] TEXT_TRUNCATED "t" segment']);
  });

  it('reports a word split across lines', async () => {
    await layOut(
      <Text testID="t" variant="body">
        Tegallalang terraces
      </Text>,
      lines('Tegalla', 'lang terraces'),
    );
    expect(reports).toEqual(['[ui-qa] TEXT_WORD_BROKEN "t" body']);
  });
});
