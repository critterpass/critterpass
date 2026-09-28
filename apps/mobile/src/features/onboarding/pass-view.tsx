/**
 * The draft pass as the onboarding screens print it (3a-2 → 3a-7): every field fills in as the
 * user answers, the MRZ follows, and the number shows its placeholder until the server's arrives.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import {
  guideOfForm,
  homeBaseFor,
  mrzLines,
  PASS_NUMBER_PLACEHOLDER,
  passStyleTags,
  tasteFromAnswers,
  type AvatarChoice,
  type PassDraft,
} from '@cp/domain';
import { format, upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { UserAvatar, type AvatarView } from '@/ui/avatar';
import { PassCard } from '@/ui/pass-card';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';

import { airportDataset, onboardingQuiz } from './content';
import { tagWords } from './taste/tag-labels';

export const PASS_DATE: Intl.DateTimeFormatOptions = {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl option values.
  day: '2-digit',
  month: 'short',
  year: 'numeric',
};

export function avatarViewOf(
  avatar: AvatarChoice | null,
  photoUri: string | null,
): AvatarView | null {
  if (avatar === null) return null;
  if (avatar.kind === 'initials') return { kind: 'initials' };
  if (avatar.kind === 'photo') {
    return photoUri === null
      ? { kind: 'initials' }
      : { kind: 'photo', uri: photoUri, cutout: true, review: 'pending' };
  }
  const guide = guideOfForm(avatar.form_id);
  return guide === null ? { kind: 'initials' } : { kind: 'guide', guide };
}

/** The photo window: the picked guide sticker, the photo, or initials. */
export function PassPhoto({
  draft,
  size = 80,
}: {
  readonly draft: PassDraft;
  readonly size?: number;
}) {
  const view = avatarViewOf(draft.avatar, draft.photo_uri);
  if (view === null) return null;
  if (view.kind === 'guide') {
    const guide = GUIDE_STICKERS[view.guide];
    return <Sticker kind={guide.kind} name={guide.name} size={size} />;
  }
  return <UserAvatar name={draft.given_name} avatar={view} viewer="self" size="xl" />;
}

export function styleTagsOf(draft: PassDraft) {
  return passStyleTags(tasteFromAnswers(onboardingQuiz(), draft.answers).tags);
}

export interface OnboardingPassCardProps {
  readonly draft: PassDraft;
  /** Replaces the printed name (3a-2 drops glyphs onto it as they are typed). */
  readonly name?: ReactNode;
  readonly stamps?: ReactNode;
  readonly corner?: ReactNode;
  /** Shown under the placeholder number until the server's arrives. */
  readonly syncing?: boolean;
  readonly stampCount?: number;
  readonly testID?: string;
}

export function OnboardingPassCard({
  draft,
  name,
  stamps,
  corner,
  syncing = false,
  stampCount = 0,
  testID = 'onboarding-pass',
}: OnboardingPassCardProps) {
  const locale = useLocale();
  const home = draft.home_iata === null ? null : homeBaseFor(airportDataset(), draft.home_iata);
  const tags = styleTagsOf(draft);
  const number = draft.number ?? PASS_NUMBER_PLACEHOLDER;
  const notYet = t({ id: 'onboarding.pass.notYet', message: 'Not yet' });
  const homeValue = home === null ? notYet : upper(`${home.city} · ${home.iata}`, locale);
  const issuedValue =
    draft.issued_at === null
      ? notYet
      : upper(format.date(locale, new Date(draft.issued_at), PASS_DATE), locale);
  const styleValue =
    tags.length === 0
      ? t({ id: 'onboarding.pass.weWillAsk', message: 'We’ll ask' })
      : upper(tags.map((tag) => tagWords(tag).short).join(' · '), locale);
  const printedName = draft.given_name.length > 0 ? draft.given_name : '';
  const lines = mrzLines({
    givenName: draft.given_name,
    number: draft.number,
    homeIso3: home?.countryIso3 ?? null,
    styleTags: tags,
    stampCount,
  });
  return (
    <PassCard
      testID={testID}
      head={t({ id: 'onboarding.pass.head', message: 'CRITTERPASS · PASSEPORT' })}
      number={number}
      {...(syncing ? { numberNote: t({ id: 'onboarding.pass.syncing', message: 'SYNCING' }) } : {})}
      photo={draft.avatar === null ? null : <PassPhoto draft={draft} />}
      nameLabel={t({ id: 'onboarding.pass.givenName', message: 'GIVEN NAME · PRÉNOM' })}
      name={
        name ?? (
          <PrintedName text={draft.issued_at === null ? printedName : upper(printedName, locale)} />
        )
      }
      home={{
        key: 'home',
        label: t({ id: 'onboarding.pass.home', message: 'HOME' }),
        value: homeValue,
        pending: home === null,
      }}
      issued={{
        key: 'issued',
        label: t({ id: 'onboarding.pass.issued', message: 'ISSUED' }),
        value: issuedValue,
        pending: draft.issued_at === null,
      }}
      style={{
        key: 'style',
        label: t({ id: 'onboarding.pass.travelStyle', message: 'TRAVEL STYLE' }),
        value: styleValue,
        pending: tags.length === 0,
      }}
      mrz={lines}
      {...(stamps ? { stamps } : {})}
      {...(corner ? { corner } : {})}
      accessibilityLabel={t({
        id: 'onboarding.pass.a11y',
        message: `Your pass ${number}: ${printedName || notYet}, home ${homeValue}, issued ${issuedValue}, travel style ${styleValue}`,
      })}
    />
  );
}

function PrintedName({ text }: { readonly text: string }) {
  return (
    <Text variant="title" numberOfLines={1}>
      {text}
    </Text>
  );
}
