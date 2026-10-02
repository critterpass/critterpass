/**
 * A "befriend" quest says where: the nearest spot of the trip's own spawn rules that can give a
 * critter on its own (not a timed or crew-together one, not another place's, and only the quest's
 * set when it names one), how far it is, and GO for directions in the maps app.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SpawnPoiRow, SpawnSqlRow } from '../../data/spawn-rows';
import { directionsUrl, nearestBefriendSpot } from '../befriend-spot';
import { QuestCardView } from '../quest-card-view';
import { buildQuestsModel, type QuestRow } from '../quests-model';
import type { BefriendPlace } from '../use-befriend-spot';

const DANANG = 'dest-danang';
const HOIAN = 'dest-hoian';
const VN = 'set-vn';

function rule(id: string, changes: Partial<SpawnSqlRow>): SpawnSqlRow {
  return {
    id,
    key: id,
    form_id: `form-${id}`,
    kind: 'presence',
    set_id: VN,
    destination_id: DANANG,
    poi_ids: '[]',
    geofences: '[]',
    n: null,
    dwell_s: 300,
    hold_ms: null,
    window_id: null,
    solar: null,
    min_members: null,
    foreground_only: 0,
    copy: null,
    critter_id: `critter-${id}`,
    rarity: 'common',
    ...changes,
  };
}

const fence = (label: string, lat: number, lng: number) =>
  JSON.stringify([{ lat, lng, radius_m: 150, label }]);

const RULES: SpawnSqlRow[] = [
  rule('linh-ung', { geofences: fence('Linh Ứng Pagoda', 16.1003, 108.2779) }),
  rule('east-sea', { poi_ids: '["poi-east-sea"]' }),
  // Nearer, but each one can't be met alone, here, or in this set.
  rule('lanterns', { kind: 'window', geofences: fence('Night market', 16.0612, 108.2278) }),
  rule('crew', { kind: 'co_presence', geofences: fence('Han market', 16.0613, 108.2279) }),
  rule('hoian', { destination_id: HOIAN, geofences: fence('Old town', 16.0614, 108.228) }),
  rule('other-set', { set_id: 'set-other', geofences: fence('Museum', 16.0615, 108.2281) }),
];
const POIS = new Map<string, SpawnPoiRow>([
  [
    'poi-east-sea',
    { id: 'poi-east-sea', name: 'East Sea Park', lat: 16.0703, lng: 108.2457, visit_radius_m: 80 },
  ],
]);
// At the Dragon Bridge.
const HERE = { lat: 16.0611, lng: 108.2277 };

describe('nearest befriend spot', () => {
  it("picks the nearest spot of the trip's own solo rules", () => {
    const spot = nearestBefriendSpot({
      rules: RULES,
      pois: POIS,
      destinationId: DANANG,
      setId: VN,
      position: HERE,
    });
    expect(spot?.name).toBe('East Sea Park');
    expect(spot?.distanceM).toBeGreaterThan(1500);
    expect(spot?.distanceM).toBeLessThan(2500);
  });

  it('names a spot without a distance before the phone has a position', () => {
    const spot = nearestBefriendSpot({
      rules: RULES,
      pois: POIS,
      destinationId: DANANG,
      setId: null,
      position: null,
    });
    expect(spot).toMatchObject({ name: 'Linh Ứng Pagoda', distanceM: null });
  });

  it('has nothing for a trip with no destination or no spawns', () => {
    const base = { pois: POIS, setId: null, position: HERE };
    expect(nearestBefriendSpot({ ...base, rules: RULES, destinationId: null })).toBeNull();
    expect(nearestBefriendSpot({ ...base, rules: [], destinationId: DANANG })).toBeNull();
  });

  it('walks to a near spot and drives to a far one', () => {
    const near = { name: 'x', lat: 16.07, lng: 108.24, distanceM: 900 };
    const far = { ...near, distanceM: 9000 };
    expect(directionsUrl(near, 'android')).toContain('travelmode=walking');
    expect(directionsUrl(far, 'android')).toContain('travelmode=driving');
    expect(directionsUrl(near, 'ios')).toBe(
      'https://maps.apple.com/?daddr=16.070000,108.240000&dirflg=w',
    );
    expect(directionsUrl(far, 'ios')).toContain('dirflg=d');
  });
});

const NOW = new Date('2026-10-02T05:00:00Z');

function befriendCard(status: string) {
  const row: QuestRow = {
    id: 'q-friends',
    local_date: '2026-10-02',
    slot: 0,
    template: 'befriend',
    params: '{"n":2}',
    target: 2,
    reward: '{"xp":80}',
    title: 'Local friends',
    body: 'Make friends with two locals.',
    scope: 'crew',
    status,
    ends_at: '2026-10-02T16:59:59Z',
    reveal_at: null,
    i18n: null,
  };
  const model = buildQuestsModel({
    loaded: true,
    trip: { startDate: '2026-10-02', endDate: '2026-10-04', tz: 'Asia/Ho_Chi_Minh' },
    crewXp: 0,
    quests: [row],
    progress: [],
    signups: [],
    members: [],
    unsettled: [],
    viewerId: null,
    now: NOW,
  });
  const card = model.cards[0];
  if (card === undefined) throw new Error('fixture');
  return card;
}

const PLACE: BefriendPlace = {
  spot: { name: 'East Sea Park', lat: 16.0703, lng: 108.2457, distanceM: 1900 },
  unit: 'metric',
};
const GUIDE = { kind: 'chava', name: 'Chà Vá' };
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function show(status: string, place: BefriendPlace) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <QuestCardView
            card={befriendCard(status)}
            guide={GUIDE}
            befriendPlace={place}
            onSignUp={() => undefined}
          />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

describe('befriend quest card', () => {
  it('says where and how, and GO opens directions to the spot', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show('active', PLACE);
    expect(screen.getByText('Nearest: East Sea Park · 1.9 km')).toBeTruthy();
    expect(screen.getByText('Stay about 5 minutes nearby with CritterPass open.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('quest-befriend-go-q-friends'));
    expect(open).toHaveBeenCalledWith(expect.stringContaining('16.070300,108.245700'));
    open.mockRestore();
  });

  it('still says how before the trip pack has a spot', async () => {
    await show('active', { spot: null, unit: 'metric' });
    expect(screen.getByText('Stay about 5 minutes nearby with CritterPass open.')).toBeTruthy();
    expect(screen.queryByTestId('quest-befriend-go-q-friends')).toBeNull();
  });

  it('drops the directions once the quest is done', async () => {
    await show('completed', PLACE);
    expect(screen.getByTestId('quest-card-q-friends')).toBeTruthy();
    expect(screen.queryByTestId('quest-befriend-q-friends')).toBeNull();
  });
});
