/**
 * The profile and account lab scenes for review and screenshots: each renders a pure view with fixed
 * props, keyed by design id and state, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, places and ids, never shipped copy. */
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { memberFirstName } from '@/ui/people/member-name';

import { ClosedView, type ClosedMode } from '../account/closed-view';
import { DeleteView, type DeleteStep } from '../account/delete-view';
import { SignOutView } from '../account/sign-out-view';
import { languageChoices } from '../language/language-names';
import { LanguageView } from '../language/language-view';
import type { ProfileModel } from '../profile/profile-model';
import { ProfileView } from '../profile/profile-view';
import { FormerMemberChat } from './lab-scenes-former';
import { HISTORY_SCENES } from './lab-scenes-history';
import { Settings } from './lab-scenes-settings';

const noop = () => undefined;

const SEASONED: ProfileModel = {
  name: 'Winston',
  username: 'winston',
  homeCity: 'Singapore',
  avatar: { kind: 'guide', guide: 'tokek' },
  ring: 'rare',
  passPlus: true,
  stats: { trips: 7, countries: 12, critters: 8 },
  stamps: [
    {
      id: 's1',
      kind: 'trip',
      title: 'Lisbon',
      date: '2024-06-03',
      daysUntil: null,
      ink: null,
      tripId: null,
    },
    {
      id: 's2',
      kind: 'trip',
      title: 'Hà Nội',
      date: '2024-02-10',
      daysUntil: null,
      ink: null,
      tripId: null,
    },
    {
      id: 's3',
      kind: 'trip',
      title: 'Seoul',
      date: '2023-10-21',
      daysUntil: null,
      ink: null,
      tripId: null,
    },
    {
      id: 's4',
      kind: 'trip',
      title: 'CDMX',
      date: '2023-03-05',
      daysUntil: null,
      ink: null,
      tripId: null,
    },
    {
      id: 's5',
      kind: 'upcoming',
      title: 'Bali',
      date: '2026-10-18',
      daysUntil: 17,
      ink: null,
      tripId: null,
    },
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
  ring: null,
  passPlus: false,
  stats: { trips: 0, countries: 1, critters: 0 },
  stamps: [
    { id: 'h', kind: 'home', title: 'SGN', date: null, daysUntil: null, ink: null, tripId: null },
  ],
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
      onRetake={noop}
      {...(model?.passPlus === false ? { onGetPassPlus: noop } : {})}
      onOpenCrew={noop}
      onStartCrew={noop}
    />
  );
}

function Delete({ step, online = true }: { readonly step: DeleteStep; readonly online?: boolean }) {
  return (
    <DeleteView
      step={step}
      online={online}
      busy={false}
      passPlus
      reason={step === 'hold' ? 'too_many_pings' : null}
      problem={null}
      onContinue={noop}
      onReason={noop}
      onDelete={noop}
      onKeep={noop}
      onBack={noop}
    />
  );
}

function Closed({ mode }: { readonly mode: ClosedMode }) {
  return (
    <ClosedView
      mode={mode}
      purgeAt={mode === 'erased' ? null : '2026-10-26T09:00:00Z'}
      closedOn={new Date('2026-09-26T09:00:00Z')}
      busy={false}
      problem={null}
      onKeep={noop}
      onClose={noop}
    />
  );
}

function SignOut({ saved }: { readonly saved: boolean }) {
  return (
    <SignOutView
      saved={saved}
      busy={false}
      problem={null}
      onSignOut={noop}
      onSavePass={noop}
      onBack={noop}
    />
  );
}

/** In the language the lab runs in, as the real screen is: current first, names in that language. */
function Language() {
  const locale = useLocale();
  return (
    <LanguageView
      choices={languageChoices(locale)}
      current={locale}
      switching={null}
      onPick={noop}
      onBack={noop}
    />
  );
}

/** A seasoned pass with two trips reported from before the app. */
const withSelfReported = (): ProfileModel => ({
  ...SEASONED,
  stamps: [
    ...SEASONED.stamps.slice(0, 2),
    {
      id: 'p1',
      kind: 'self' as const,
      title: 'JP',
      date: '2022-04-01',
      daysUntil: null,
      ink: null,
      tripId: null,
    },
    ...SEASONED.stamps.slice(2),
  ].slice(0, 5),
});

/** A crew after one member's account was erased (named at render, in the lab's language). */
const withFormer = (): ProfileModel => ({
  ...SEASONED,
  crews: [
    {
      id: 'c1',
      name: 'The Bali Six',
      members: [
        { id: 'maya', name: memberFirstName('Maya Tan'), joinIndex: 0 },
        { id: 'gone', name: memberFirstName(null), joinIndex: 1 },
        { id: 'jordan', name: memberFirstName('Jordan'), joinIndex: 2 },
      ],
      line: { kind: 'upcoming', place: 'Bali', days: 17 },
    },
  ],
});

export const YOU_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3n-1-profile': () => <Profile model={SEASONED} />,
  '3n-1-fresh': () => <Profile model={FRESH} />,
  '3n-1-loading': () => <Profile model={null} />,
  '3n-1-self-reported': () => <Profile model={withSelfReported()} />,
  ...HISTORY_SCENES,
  '3n-2-settings': () => <Settings />,
  '3n-8-language': () => <Language />,
  'former-member-crew': () => <Profile model={withFormer()} />,
  'former-member-chat': () => <FormerMemberChat />,
  'sign-out-saved': () => <SignOut saved />,
  'sign-out-unsaved': () => <SignOut saved={false} />,
  '3n-9-delete': () => <Delete step="review" />,
  '3n-10-hold': () => <Delete step="hold" />,
  '3n-10-offline': () => <Delete step="hold" online={false} />,
  '3n-11-closed': () => <Closed mode="closed" />,
  '3n-11-erased': () => <Closed mode="erased" />,
  '3n-11-restore': () => <Closed mode="restore" />,
};

export const YOU_SCENE_NAMES = Object.keys(YOU_SCENES);
