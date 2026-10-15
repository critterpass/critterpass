/**
 * Report a problem under a place's summary, over the real local-first stack: offline the report
 * queues and the link gives way to the thanks.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { ReportPlaceProfile } from '../place-extras';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('report a place summary', () => {
  it('queues the report offline and thanks the person', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const s = stack;
    s.network.set(false);
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    await render(
      <I18nProvider i18n={i18n}>
        <LocalFirstProvider value={s.value}>
          <ReportPlaceProfile poiId="poi-1" />
        </LocalFirstProvider>
      </I18nProvider>,
    );
    await fireEvent.press(screen.getByTestId('place-detail-profile-report'));
    expect(await screen.findByTestId('place-detail-profile-reported')).toBeTruthy();
    await waitFor(async () => {
      const rows = await s.db.getAll<{ envelope: string }>(
        "SELECT envelope FROM commands WHERE cmd = 'report_content'",
      );
      expect(rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload)).toEqual(
        [{ kind: 'place_profile', id: 'poi-1', reason: 'inaccurate' }],
      );
    });
  });
});
