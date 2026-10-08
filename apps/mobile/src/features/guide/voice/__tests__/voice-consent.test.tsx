/**
 * The voice consent over the real local-first stack: voice mode stays behind the question until
 * the person's own consent row stands (a withdrawn one asks again), a yes opens voice at once and
 * queues `set_consent` for `ai_voice`, and nothing of voice mode mounts before that.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { markCommandsDone } from '@/data/powersync/queue-store';

import {
  refusalOf,
  useVoiceConsent,
  voiceConsentGranted,
  withVoiceConsent,
  type VoiceConsentGuard,
} from '../voice-consent';
import { renderScreen } from '../test-support/screen-harness';
import { VoiceGate } from '../voice-consent-view';

configure({ asyncUtilTimeout: 5000 });

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  answers = [];
  requests.mockClear();
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  return stack;
}

/** The api's answer to a voice request from someone it holds no standing voice consent for. */
const consentRefusal = () =>
  Response.json(
    {
      error: {
        code: 'CONSENT_REQUIRED',
        message: 'This needs a consent you have not given',
        retryable: false,
        detail: { purpose: 'ai_voice' },
      },
    },
    { status: 403 },
  );

/** What the api answers the next voice requests with, in order; then it gives the token. */
let answers: (() => Response)[] = [];
const requests = jest.fn();
const token = () => Response.json({ token: 'dg', scheme: 'bearer', expires_at: '2026-10-07' });

const mounted = jest.fn();
function VoiceMode({ consent }: { readonly consent: VoiceConsentGuard }) {
  mounted();
  // A voice request, as the speech token or a spoken turn would be; the retry does not wait.
  const request = () =>
    void withVoiceConsent(
      async () => {
        requests();
        const response = (answers.shift() ?? token)();
        if (!response.ok) throw await refusalOf(response, 'stt token');
      },
      consent,
      () => Promise.resolve(),
    ).catch(() => undefined);
  return (
    <Pressable testID="voice-request" onPress={request}>
      <Text testID="voice-mode">voice</Text>
    </Pressable>
  );
}

/** The server took this phone's queued yes, as the upload queue records it. */
async function serverTakesTheYes(stack: TestLocalFirst): Promise<void> {
  const rows = await stack.db.getAll<{ id: string }>(
    "SELECT id FROM commands WHERE cmd = 'set_consent'",
  );
  await stack.db.writeTransaction((tx) =>
    markCommandsDone(
      tx,
      rows.map((row) => row.id),
    ),
  );
}

function Gated({ onType }: { readonly onType: () => void }) {
  return <GatedVoice onType={onType} />;
}

function show(stack: TestLocalFirst, onType: () => void = () => undefined) {
  return renderScreen(<Gated onType={onType} />, stack);
}

function GatedVoice({ onType }: { readonly onType: () => void }) {
  const consent = useVoiceConsent();
  return (
    <VoiceGate
      status={consent.status}
      guideName="Tokek"
      sticker={null}
      onAgree={consent.agree}
      onType={onType}
    >
      <VoiceMode consent={consent} />
    </VoiceGate>
  );
}

async function queued(stack: TestLocalFirst) {
  const rows = await stack.db.getAll<{ cmd: string; envelope: string }>(
    'SELECT cmd, envelope FROM commands ORDER BY seq',
  );
  return rows.map((row) => ({
    cmd: row.cmd,
    payload: (JSON.parse(row.envelope) as { payload: Record<string, unknown> }).payload,
  }));
}

describe('standing consent', () => {
  it('needs a grant that has not been withdrawn', () => {
    expect(voiceConsentGranted([])).toBe(false);
    expect(voiceConsentGranted([{ granted_at: '2026-10-01T00:00:00Z', revoked_at: null }])).toBe(
      true,
    );
    expect(
      voiceConsentGranted([
        { granted_at: '2026-10-01T00:00:00Z', revoked_at: '2026-10-02T00:00:00Z' },
      ]),
    ).toBe(false);
    expect(voiceConsentGranted([{ granted_at: null, revoked_at: '2026-10-02T00:00:00Z' }])).toBe(
      false,
    );
  });
});

describe('voice mode behind its consent', () => {
  it('asks first, and a yes opens voice only once the server has it: no second question', async () => {
    mounted.mockClear();
    const stack = await open();
    const onType = jest.fn();
    await show(stack, onType);
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    expect(screen.queryByTestId('voice-mode')).toBeNull();
    expect(mounted).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('guide-voice-consent-no'));
    expect(onType).toHaveBeenCalledTimes(1);
    expect(await queued(stack)).toEqual([]);

    await fireEvent.press(screen.getByTestId('guide-voice-consent-yes'));
    await waitFor(async () =>
      expect(await queued(stack)).toEqual([
        {
          cmd: 'set_consent',
          payload: { purpose: 'ai_voice', granted: true, copy_version: 'voice-2026-10' },
        },
      ]),
    );
    // Sent, not yet taken: nothing of voice mode runs, so nothing can be refused.
    expect(screen.queryByTestId('voice-mode')).toBeNull();
    expect(screen.queryByTestId('guide-voice-consent-offline')).toBeNull();
    expect(mounted).not.toHaveBeenCalled();

    await serverTakesTheYes(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('voice-request'));
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('voice-mode')).toBeTruthy();
    expect(screen.queryByTestId('guide-voice-consent')).toBeNull();
  });

  it('a refusal right after the yes is the yes still landing: one more try, no second question', async () => {
    const stack = await open();
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('guide-voice-consent-yes'));
    await waitFor(async () => expect(await queued(stack)).toHaveLength(1));
    await serverTakesTheYes(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());

    answers = [consentRefusal];
    await fireEvent.press(screen.getByTestId('voice-request'));
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('voice-mode')).toBeTruthy();
    expect(screen.queryByTestId('guide-voice-consent')).toBeNull();
  });

  it('asks again when the server still refuses after that one more try', async () => {
    const stack = await open();
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('guide-voice-consent-yes'));
    await waitFor(async () => expect(await queued(stack)).toHaveLength(1));
    await serverTakesTheYes(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());

    answers = [consentRefusal, consentRefusal];
    await fireEvent.press(screen.getByTestId('voice-request'));
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it('says voice needs a connection when the yes is given offline, and opens once it is sent', async () => {
    mounted.mockClear();
    const stack = await open();
    stack.network.set(false);
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('guide-voice-consent-yes'));
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent-offline')).toBeTruthy());
    await waitFor(async () => expect(await queued(stack)).toHaveLength(1));
    expect(mounted).not.toHaveBeenCalled();

    stack.network.set(true);
    await waitFor(() => expect(screen.queryByTestId('guide-voice-consent-offline')).toBeNull());
    expect(screen.queryByTestId('voice-mode')).toBeNull();
    await serverTakesTheYes(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());
  });

  it('opens straight away when the consent stands, and asks again once it is withdrawn', async () => {
    const stack = await open();
    await stack.db.execute(
      "INSERT INTO consents (id, user_id, purpose, granted_at) VALUES ('c1', ?, 'ai_voice', '2026-10-01T06:00:00Z')",
      [stack.uid],
    );
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());
    expect(screen.queryByTestId('guide-voice-consent')).toBeNull();

    await stack.db.execute(
      "UPDATE consents SET revoked_at = '2026-10-03T06:00:00Z' WHERE id = 'c1'",
    );
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    expect(screen.queryByTestId('voice-mode')).toBeNull();
  });

  it("does not take another purpose's consent for the voice one", async () => {
    const stack = await open();
    await stack.db.execute(
      "INSERT INTO consents (id, user_id, purpose, granted_at) VALUES ('c2', ?, 'analytics', '2026-10-01T06:00:00Z')",
      [stack.uid],
    );
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
  });

  it('asks when the server refuses someone who gave no yes on this phone just now', async () => {
    const stack = await open();
    await stack.db.execute(
      "INSERT INTO consents (id, user_id, purpose, granted_at) VALUES ('c3', ?, 'ai_voice', '2026-10-01T06:00:00Z')",
      [stack.uid],
    );
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());

    answers = [consentRefusal];
    await fireEvent.press(screen.getByTestId('voice-request'));
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    expect(screen.queryByTestId('voice-mode')).toBeNull();
    // Refused outright: nothing was tried a second time.
    expect(requests).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('guide-voice-consent-yes'));
    await waitFor(async () => expect(await queued(stack)).toHaveLength(1));
    await serverTakesTheYes(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());
  });

  it('leaves any other refusal to the caller', async () => {
    const askAgain = jest.fn();
    const guard = { askAgain, grantedJustNow: () => true };
    const unavailable = Response.json(
      { error: { code: 'SUPPLIER_UNAVAILABLE', message: 'Try again later', retryable: true } },
      { status: 503 },
    );
    await expect(
      withVoiceConsent(async () => {
        throw await refusalOf(unavailable, 'stt token');
      }, guard),
    ).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE' });
    expect(askAgain).not.toHaveBeenCalled();
  });
});
