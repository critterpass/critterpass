/**
 * The profile area's lab scenes for review and screenshots: each renders a pure view with fixed
 * props, keyed by design id and state, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, places and ids, never shipped copy. */
import type { ReactNode } from 'react';

import type { ProfileModel } from '../profile/profile-model';
import { ProfileView } from '../profile/profile-view';
import { useSettingsSections } from '../settings/settings-sections';
import { SettingsView } from '../settings/settings-view';

const noop = () => undefined;

const SEASONED: ProfileModel = {
  name: 'Winston',
  username: 'winston',
  homeCity: 'Singapore',
  avatar: { kind: 'guide', guide: 'tokek' },
  passPlus: true,
  stats: { trips: 7, countries: 12, critters: 8 },
  stamps: [
    { id: 's1', kind: 'trip', title: 'Lisbon', date: '2024-06-03', daysUntil: null, ink: null },
    { id: 's2', kind: 'trip', title: 'Hà Nội', date: '2024-02-10', daysUntil: null, ink: null },
    { id: 's3', kind: 'trip', title: 'Seoul', date: '2023-10-21', daysUntil: null, ink: null },
    { id: 's4', kind: 'trip', title: 'CDMX', date: '2023-03-05', daysUntil: null, ink: null },
    { id: 's5', kind: 'upcoming', title: 'Bali', date: '2026-10-18', daysUntil: 17, ink: null },
  ],
  stampTotal: 12,
  tags: ['early_starts', 'street_food', 'museums', 'photo_spots', 'easy_pace'],
  crews: [
    {
      id: 'c1',
      name: 'The Bali Six',
      members: ['Maya', 'Arjun', 'Jordan', 'Rin'].map((name, joinIndex) => ({
        id: name,
        name,
        joinIndex,
      })),
      line: { kind: 'upcoming', place: 'Bali', days: 17 },
    },
    {
      id: 'c2',
      name: 'Uni housemates',
      members: ['Kai', 'Sofia', 'Tom'].map((name, joinIndex) => ({ id: name, name, joinIndex })),
      line: { kind: 'past', place: 'Lisbon', date: '2024-06-03' },
    },
  ],
  mrz: 'P<SGPWINSTON<<CP0427',
  sinceYear: 2022,
};

/** A minute after onboarding: a name, a home stamp, the quiz's tags, nothing else. */
const FRESH: ProfileModel = {
  name: 'Khánh',
  username: null,
  homeCity: 'Hồ Chí Minh City',
  avatar: { kind: 'initials' },
  passPlus: false,
  stats: { trips: 0, countries: 1, critters: 0 },
  stamps: [{ id: 'h', kind: 'home', title: 'SGN', date: null, daysUntil: null, ink: null }],
  stampTotal: 1,
  tags: ['street_food', 'coffee', 'easy_pace'],
  crews: [],
  mrz: 'P<VNMKHANH<<CP0012',
  sinceYear: 2026,
};

function Profile({ model }: { readonly model: ProfileModel | null }) {
  return (
    <ProfileView
      model={model}
      onBack={noop}
      onEdit={noop}
      onSettings={noop}
      onAllStamps={noop}
      onOpenCrew={noop}
      onStartCrew={noop}
    />
  );
}

function Settings() {
  const sections = useSettingsSections(
    { soundEffects: true, haptics: true },
    { onOfflineTrips: noop, onSoundEffects: noop, onHaptics: noop },
  );
  return <SettingsView sections={sections} version="CRITTERPASS 1.0 (214)" onBack={noop} />;
}

export const YOU_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3n-1-profile': () => <Profile model={SEASONED} />,
  '3n-1-fresh': () => <Profile model={FRESH} />,
  '3n-1-loading': () => <Profile model={null} />,
  '3n-2-settings': () => <Settings />,
};

export const YOU_SCENE_NAMES = Object.keys(YOU_SCENES);
