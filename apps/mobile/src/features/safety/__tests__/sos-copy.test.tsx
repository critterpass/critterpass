import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import { buildSosModel, type SosRow } from '../sos/sos-model';
import { SosView } from '../sos/sos-view';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const SENDER = 'u-mai';

function sos(n: number): SosRow {
  return {
    id: 'sos-1',
    trip_id: 'trip-1',
    user_id: SENDER,
    status: 'open',
    preset: 'fell',
    body: null,
    summary: null,
    responder_ids: '[]',
    responses: '{}',
    steps: JSON.stringify({ sent: { state: 'done', n } }),
    alerted_count: n,
    escalated_at: null,
    false_alarm: 0,
    opened_at: '2026-10-02T09:42:00Z',
    resolved_at: null,
  };
}

async function renderSender(n: number) {
  const model = buildSosModel(sos(n), SENDER, new Map([[SENDER, 'Mai']]));
  const noop = () => undefined;
  await renderUi(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>
        <SosView
          hero={{ model, words: '', message: null, distanceM: null }}
          steps={{ guideName: 'Chà Vá', guideSticker: { kind: 'gecko', name: 'tokek' } }}
          model={model}
          general="115"
          senderPhone={null}
          busy={false}
          onGoing={noop}
          onCallSender={noop}
          onCallGeneral={noop}
          onOk={noop}
          onSafe={noop}
          onSendAgain={noop}
          onClose={noop}
          onMap={noop}
        />
      </ScreenJoltProvider>
    </SafeAreaProvider>,
  );
}

describe('the sender after an SOS', () => {
  it('alone on the trip: says nobody got it and puts the local number first', async () => {
    await renderSender(0);
    expect(screen.getByText(/^nobody else is in your crew yet\. call 115 now\.$/iu)).toBeTruthy();
    expect(screen.queryByText(/all 0 of you/u)).toBeNull();
    expect(screen.queryByTestId('sos-seen')).toBeNull();
    const buttons = screen.getAllByRole('button').map((b) => b.props.testID as string | undefined);
    expect(buttons.indexOf('sos-call-general')).toBeLessThan(buttons.indexOf('sos-ok'));
  });

  it('one crewmate and five read as people, not "all 1 of you"', async () => {
    await renderSender(1);
    expect(screen.getByText(/^sos sent to your one crewmate$/iu)).toBeTruthy();
    expect(screen.queryByTestId('sos-nobody')).toBeNull();
    await renderSender(5);
    expect(screen.getByText(/^sos sent to all 5 of you$/iu)).toBeTruthy();
  });
});
