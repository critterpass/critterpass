import { describe, expect, it } from '@jest/globals';

import {
  addAttachments,
  canSend,
  condensedNote,
  deviceLine,
  feedbackPayload,
  initialDraft,
  topicsFor,
} from '../feedback/draft';

const DEVICE = {
  os: 'iOS',
  os_version: '26.0',
  app_version: '1.0',
  build: '214',
  model: 'iPhone 17',
  locale: 'en',
  tz: 'Asia/Ho_Chi_Minh',
  network: 'wifi' as const,
};

describe('the send-feedback form', () => {
  it('offers BUG only in a problem report, and starts there', () => {
    expect(topicsFor('problem')[0]).toBe('bug');
    expect(topicsFor('feedback')).not.toContain('bug');
    expect(initialDraft('problem').category).toBe('bug');
    expect(initialDraft('feedback').category).toBeNull();
  });

  it('sends three characters of text, or a mood with a topic', () => {
    const draft = initialDraft('feedback');
    expect(canSend(draft)).toBe(false);
    expect(canSend({ ...draft, text: 'ok!' })).toBe(true);
    expect(canSend({ ...draft, mood: 'love' })).toBe(false);
    expect(canSend({ ...draft, mood: 'love', category: 'money' })).toBe(true);
  });

  it('keeps three attachments at most and turns away files too big to upload', () => {
    const file = (bytes: number | null) => ({
      uri: `file://${String(bytes)}`,
      contentType: 'image/jpeg',
      bytes,
    });
    const { draft, tooBig } = addAttachments(initialDraft('feedback'), [
      file(10),
      file(9_000_000),
      file(null),
      file(20),
      file(30),
    ]);
    expect(draft.attachments.map((a) => a.bytes)).toEqual([10, null, 20]);
    expect(tooBig).toBe(1);
  });

  it('sends device info only while the toggle is on', () => {
    const base = {
      id: '0199a3f0-0000-7000-8000-000000000001',
      device: DEVICE,
      context: { screen: 'settings', tripId: null, articleSlug: 'refunds' },
      source: 'settings' as const,
      mediaKeys: [],
    };
    const on = feedbackPayload({
      ...base,
      draft: { ...initialDraft('feedback'), text: ' Hi there ' },
    });
    expect(on.device_info).toEqual(DEVICE);
    expect(on.text).toBe('Hi there');
    expect(on.context).toEqual({ screen: 'settings', trip_id: null, article_slug: 'refunds' });
    const off = feedbackPayload({
      ...base,
      draft: { ...initialDraft('feedback'), text: 'Hi', includeDeviceInfo: false },
    });
    expect([off.include_device_info, off.device_info]).toEqual([false, null]);
  });

  it('shows the device line and pins the first 140 characters', () => {
    expect(deviceLine(DEVICE)).toBe('iOS 26.0 · v1.0 (214)');
    expect(condensedNote('short  note\n')).toBe('short note');
    const long = condensedNote('word '.repeat(60));
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith('…')).toBe(true);
  });
});
