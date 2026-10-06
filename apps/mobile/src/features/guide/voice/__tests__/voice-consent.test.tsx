/**
 * The voice consent over the real local-first stack: voice mode stays behind the question until
 * the person's own consent row stands (a withdrawn one asks again), a yes opens voice at once and
 * queues `set_consent` for `ai_voice`, and nothing of voice mode mounts before that.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  refusalOf,
  useVoiceConsent,
  voiceConsentGranted,
  withVoiceConsent,
} from '../voice-consent';
import { renderScreen } from '../test-support/screen-harness';
import { VoiceGate } from '../voice-consent-view';

configure({ asyncUtilTimeout: 5000 });

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
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

const mounted = jest.fn();
function VoiceMode({ onConsentRequired }: { readonly onConsentRequired: () => void }) {
  mounted();
  // A voice request the server refuses, as the speech token or a spoken turn would be.
  const request = () =>
    void withVoiceConsent(async () => {
      throw await refusalOf(consentRefusal(), 'stt token');
    }, onConsentRequired).catch(() => undefined);
  return (
    <Pressable testID="voice-request" onPress={request}>
      <Text testID="voice-mode">voice</Text>
    </Pressable>
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
      <VoiceMode onConsentRequired={consent.askAgain} />
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
  it('asks first, mounts nothing of voice mode, and a yes opens it and queues the consent', async () => {
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
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());
    await waitFor(async () =>
      expect(await queued(stack)).toEqual([
        {
          cmd: 'set_consent',
          payload: { purpose: 'ai_voice', granted: true, copy_version: 'voice-2026-10' },
        },
      ]),
    );
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

  it('asks again when the server refuses for want of the consent, and a yes reopens voice', async () => {
    const stack = await open();
    await stack.db.execute(
      "INSERT INTO consents (id, user_id, purpose, granted_at) VALUES ('c3', ?, 'ai_voice', '2026-10-01T06:00:00Z')",
      [stack.uid],
    );
    await show(stack);
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('voice-request'));
    await waitFor(() => expect(screen.getByTestId('guide-voice-consent')).toBeTruthy());
    expect(screen.queryByTestId('voice-mode')).toBeNull();

    await fireEvent.press(screen.getByTestId('guide-voice-consent-yes'));
    await waitFor(() => expect(screen.getByTestId('voice-mode')).toBeTruthy());
    await waitFor(async () =>
      expect((await queued(stack)).map((entry) => entry.payload)).toEqual([
        { purpose: 'ai_voice', granted: true, copy_version: 'voice-2026-10' },
      ]),
    );
  });

  it('leaves any other refusal to the caller', async () => {
    const askAgain = jest.fn();
    const unavailable = Response.json(
      { error: { code: 'SUPPLIER_UNAVAILABLE', message: 'Try again later', retryable: true } },
      { status: 503 },
    );
    await expect(
      withVoiceConsent(async () => {
        throw await refusalOf(unavailable, 'stt token');
      }, askAgain),
    ).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE' });
    expect(askAgain).not.toHaveBeenCalled();
  });
});
