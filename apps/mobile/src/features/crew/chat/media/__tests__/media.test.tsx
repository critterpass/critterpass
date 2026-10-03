/**
 * Chat media on the real local-first stack, with the media api answered at the HTTP boundary by
 * recorded responses and the picker, microphone and player as device doubles: a photo queued
 * offline uploads and sends exactly once after reconnect (even when the queue runs twice, or the
 * app died between sending and clearing the upload), large files go multipart, voice notes record
 * from the mic (and a denied mic points to Settings). Playback lives in voice-message.test.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { CrewChat } from '../../components/chat-screen';
import {
  CREW,
  MAYA,
  queued,
  renderChat,
  seedCrew,
  seedMessage,
} from '../../test-support/chat-harness';
import { ChatMediaProvider } from '../media-services';
import { clearReadUrlCache } from '../read-urls';
import { uploadAttachment } from '../upload';
import { createChatUploadQueue, listUploads } from '../use-upload-queue';
import {
  deviceDouble,
  recordedMediaApi,
  type RecordedMediaApi,
} from '../../test-support/media-doubles';

let stack: TestLocalFirst | null = null;
let api: RecordedMediaApi;

beforeEach(() => {
  api = recordedMediaApi();
  clearReadUrlCache();
});

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  return stack;
}

describe('upload queue', () => {
  it('sends a photo queued offline exactly once after reconnect', async () => {
    const s = await open();
    s.network.set(false);
    const queue = createChatUploadQueue({
      db: s.db,
      commands: s.value.commands,
      media: deviceDouble(api),
      network: s.network,
    });
    await queue.enqueue({
      crewId: CREW,
      body: '',
      files: [
        { uri: 'file:///sunrise.jpg', kind: 'photo', contentType: 'image/jpeg', w: 1600, h: 1200 },
      ],
    });
    await queue.process();
    expect(api.calls).toEqual([]);
    expect((await listUploads(s.db)).map((item) => item.state)).toEqual(['waiting']);

    s.network.set(true);
    await Promise.all([queue.process(), queue.process()]);
    await queue.process();

    expect(api.calls.map((call) => call.path)).toEqual(['/v1/media/presign', 'PUT']);
    expect(await queued(s, 'send_message')).toEqual([
      {
        crew_id: CREW,
        body: '',
        mentions: [],
        mentions_guide: false,
        attachments: [{ media_key: api.keys[0], kind: 'photo', w: 1600, h: 1200 }],
      },
    ]);
    expect(await listUploads(s.db)).toEqual([]);
  });

  it('does not send twice when the app died between sending and clearing the upload', async () => {
    const s = await open();
    const media = deviceDouble(api);
    const queue = createChatUploadQueue({
      db: s.db,
      commands: s.value.commands,
      media,
      network: s.network,
    });
    const item = await queue.enqueue({
      crewId: CREW,
      body: 'lunch',
      files: [{ uri: 'file:///warung.jpg', kind: 'photo', contentType: 'image/jpeg' }],
    });
    await queue.process();
    expect(await queued(s, 'send_message')).toHaveLength(1);
    // The upload row comes back (as after a crash right after the send was queued).
    const sentKey = api.keys[0] ?? '';
    await s.db.execute('INSERT INTO local_state (id, value) VALUES (?, ?)', [
      `chat_upload:${item.id}`,
      JSON.stringify({ ...item, files: [{ ...item.files[0], mediaKey: sentKey }] }),
    ]);
    await queue.process();
    expect(await queued(s, 'send_message')).toHaveLength(1);
    expect(await listUploads(s.db)).toEqual([]);
  });

  it('keeps a refused upload as failed until RETRY', async () => {
    const s = await open();
    api.refusePresign = true;
    const queue = createChatUploadQueue({
      db: s.db,
      commands: s.value.commands,
      media: deviceDouble(api),
      network: s.network,
    });
    const item = await queue.enqueue({
      crewId: CREW,
      body: '',
      files: [{ uri: 'file:///big.jpg', kind: 'photo', contentType: 'image/jpeg' }],
    });
    await queue.process();
    expect((await listUploads(s.db)).map((row) => [row.state, row.error])).toEqual([
      ['failed', 'PAYLOAD_TOO_LARGE'],
    ]);
    api.refusePresign = false;
    await queue.retry(item.id);
    await queue.process();
    expect(await queued(s, 'send_message')).toHaveLength(1);
  });

  it('uploads files over 5 MB in parts and completes with their ETags', async () => {
    const bytes = new Uint8Array(12 * 1024 * 1024);
    const outcome = await uploadAttachment(
      api.http,
      { purpose: 'photo', contentType: 'image/jpeg', bytes, sha256: 'a'.repeat(64) },
      () => undefined,
    );
    expect(outcome).toEqual({ kind: 'uploaded', mediaKey: api.keys[0] });
    expect(api.calls.map((call) => call.path)).toEqual([
      '/v1/media/multipart',
      `/v1/media/multipart/${encodeURIComponent(api.keys[0] ?? '')}/parts`,
      'PUT',
      'PUT',
      `/v1/media/multipart/${encodeURIComponent(api.keys[0] ?? '')}/complete`,
    ]);
    expect(api.calls.at(-1)?.body).toMatchObject({
      parts: [
        { part_number: 1, etag: '"etag-1"' },
        { part_number: 2, etag: '"etag-2"' },
      ],
    });
  });
});

describe('in the chat', () => {
  async function renderWithMedia(s: TestLocalFirst, media = deviceDouble(api)) {
    await renderChat(
      <ChatMediaProvider services={media}>
        <CrewChat crewId={CREW} />
      </ChatMediaProvider>,
      s,
    );
    return media;
  }

  it('picks photos from the library into an upload at the foot of the chat', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'pics?' });
    s.network.set(false);
    await renderWithMedia(s);
    await fireEvent.press(await screen.findByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Photo library'));
    expect(await screen.findByText('Waiting for signal')).toBeTruthy();
    expect(screen.getByText(/^photo$/iu)).toBeTruthy();
  });

  it('points a denied camera to Settings with the library as the way on', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'pics?' });
    s.network.set(false);
    const media = await renderWithMedia(s, deviceDouble(api, { camera: 'denied' }));
    await fireEvent.press(await screen.findByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Camera'));
    expect(await screen.findByText(/^the camera is off$/iu)).toBeTruthy();
    await fireEvent.press(screen.getByText(/^pick from the library$/iu));
    await waitFor(() => expect(media.picked).toEqual(['camera', 'library']));
  });

  it('says the photo picker failed, not that access is off, and picks on a retry', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'pics?' });
    s.network.set(false);
    const media = await renderWithMedia(s, deviceDouble(api, { library: 'fails-once' }));
    await fireEvent.press(await screen.findByLabelText('Add attachment'));
    await fireEvent.press(await screen.findByText('Photo library'));
    expect(await screen.findByText('Couldn’t open your photos. Try again.')).toBeTruthy();
    expect(screen.queryByText(/^photo access is off$/iu)).toBeNull();
    await fireEvent.press(screen.getByText('Photo library'));
    await waitFor(() => expect(media.picked).toEqual(['library', 'library']));
    await waitFor(() => expect(screen.queryByTestId('chat-attach-failed')).toBeNull());
    await waitFor(async () => expect(await listUploads(s.db)).toHaveLength(1));
  });

  it('records a hands-free voice note and queues its upload with peaks', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'say it' });
    s.network.set(false);
    await renderWithMedia(s);
    await fireEvent(await screen.findByLabelText('Record a voice message'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(await screen.findByText('Slide to cancel')).toBeTruthy();
    await fireEvent.press(screen.getByText(/^send$/iu));
    expect(await screen.findByText(/^voice note$/iu)).toBeTruthy();
    const [item] = await listUploads(s.db);
    expect(item?.files[0]).toMatchObject({
      kind: 'voice',
      contentType: 'audio/mp4',
      durationMs: 4200,
    });
    expect(item?.files[0]?.peaks?.length).toBe(48);
  });

  it('shows the Settings card when the microphone is denied', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'say it' });
    await renderWithMedia(s, deviceDouble(api, { mic: 'denied' }));
    await fireEvent(await screen.findByLabelText('Record a voice message'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    expect(await screen.findByText(/^the microphone is off$/iu)).toBeTruthy();
  });
});
