/**
 * Edit profile (9.02): the passport's data page updating live above the fields, the field card
 * (each field edits in its sheet, Return "Done"), then App icon and Appearance. Save is the one
 * ink action; leaving with changes asks first.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import {
  Icon,
  ListCard,
  Row,
  Text,
  useAppearance,
  usePremiumTheme,
  type PremiumIconName,
} from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { languageChoices } from '../../language/language-names';
import { YOU_ROUTES } from '../../routes';
import { nameProblemText, usernameText } from '../../edit-profile/edit-profile-copy';
import { airportLabel, useEditProfile } from '../../edit-profile/use-edit-profile';
import { useAppearanceWords } from './appearance-copy';
import {
  AirportPremiumSheet,
  LanguagesPremiumSheet,
  NamePremiumSheet,
  UsernamePremiumSheet,
} from './field-sheets-premium';
import { DataPage } from './data-page';

/* eslint-disable lingui/no-unlocalized-strings -- routes, never copy. */
const APPEARANCE_ROUTE = '/you/appearance';
/* eslint-enable lingui/no-unlocalized-strings */

function Tile({ glyph, color }: { readonly glyph: PremiumIconName; readonly color: string }) {
  const th = usePremiumTheme();
  return (
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={glyph} size={20} color={th.color.onInk} />
    </View>
  );
}

export function EditProfilePremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const edit = useEditProfile();
  const [appearance] = useAppearance();
  const appearanceWords = useAppearanceWords();
  const { draft, saved, locale } = edit;

  const { leaving, setLeaving, discard } = edit;
  useEffect(() => {
    if (!leaving) return;
    setLeaving(false);
    void confirmAlert({
      title: t({ id: 'you.edit.discardTitle', message: 'Leave without saving?' }),
      message: t({
        id: 'you.edit.discardLine',
        message: 'Your changes to the profile are dropped.',
      }),
      confirm: t({ id: 'you.edit.discard', message: 'Leave' }),
      cancel: t({ id: 'you.premium.keepEditing', message: 'Keep editing' }),
    }).then((leave) => {
      if (leave) discard();
    });
  }, [leaving, setLeaving, discard, t]);

  const chevron = <Icon name="forward" size={16} color={th.color.placeholder} />;
  const fields = [
    {
      key: 'name',
      label: t({ id: 'you.edit.name', message: 'Name' }),
      value: draft?.name ?? '',
      note: edit.nameProblem === null ? null : nameProblemText(edit.nameProblem),
    },
    {
      key: 'username',
      label: t({ id: 'you.edit.username', message: 'Username' }),
      value:
        draft === null || draft.username === ''
          ? t({ id: 'you.edit.username.none', message: 'Pick a username' })
          : `@${draft.username}`,
      note: usernameText(edit.username, locale),
    },
    {
      key: 'home-airport',
      label: t({ id: 'you.edit.homeAirport', message: 'Home airport' }),
      value: airportLabel(draft?.homeAirport ?? null),
      note: null,
    },
    {
      key: 'languages',
      label: t({ id: 'you.edit.languages', message: 'Languages' }),
      value:
        draft === null || draft.languages.length === 0
          ? t({ id: 'you.edit.languages.none', message: 'Add languages' })
          : edit.languagesText(draft.languages),
      note: null,
    },
  ] as const;

  return (
    <>
      <PushScreen
        title={t({ id: 'you.premium.editTitle', message: 'Edit profile' })}
        backLabel={t({ id: 'you.profile.backPass', message: 'Pass' })}
        testID="you-edit"
        action={{
          key: 'save',
          label: edit.saving
            ? t({ id: 'you.premium.saving', message: 'Saving…' })
            : t({ id: 'you.premium.save', message: 'Save' }),
          sfSymbol: 'checkmark',
          glyph: 'check',
          primary: true,
          text: true,
          onPress: () => {
            if (edit.canSave && !edit.saving) void edit.save();
          },
          testID: 'you-edit-save',
        }}
      >
        <View style={{ gap: th.space.gap14, paddingTop: th.space.gap12 }}>
          <DataPage
            model={edit.model}
            name={draft?.name ?? ''}
            username={draft?.username ?? ''}
            homeAirport={draft?.homeAirport ?? null}
            photoUri={edit.photoUri}
            onChangePhoto={() => router.push(YOU_ROUTES.avatar)}
          />
          {/* Centred under the page with the crew glyph, as the design says who sees it. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: th.space.gap6,
              paddingHorizontal: th.space.titleGutter,
            }}
          >
            <Icon name="people" size={14} color={th.color.muted} />
            <Text variant="caption" tone="muted" align="center">
              {t({ id: 'you.premium.crewsSee', message: 'This page is all your crews ever see' })}
            </Text>
          </View>
          {edit.problem === null ? null : (
            <Text
              variant="caption"
              color={th.color.destructive.helper}
              style={{ paddingHorizontal: th.space.titleGutter }}
              testID="you-edit-problem"
            >
              {edit.problem}
            </Text>
          )}
          <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap12 }}>
            <ListCard testID="you-edit-fields">
              {fields.map((field) => (
                <Row
                  key={field.key}
                  title={field.value}
                  {...(field.note === null ? {} : { subtitle: field.note })}
                  leading={
                    <Text variant="rowText" tone="muted" style={{ width: 104 }}>
                      {field.label}
                    </Text>
                  }
                  trailing={chevron}
                  onPress={() => edit.setEditing(field.key)}
                  testID={`you-edit-${field.key}`}
                />
              ))}
            </ListCard>
            <ListCard>
              <Row
                title={t({ id: 'you.premium.appIcon', message: 'App icon' })}
                leading={<Tile glyph="pass" color={th.accent.tangerine} />}
                trailing={chevron}
                onPress={() => router.push(YOU_ROUTES.appIcon)}
                testID="you-edit-app-icon"
              />
              <Row
                title={t({ id: 'you.premium.appearance', message: 'Appearance' })}
                subtitle={appearanceWords[appearance]}
                leading={<Tile glyph="appearance" color={th.color.ink} />}
                trailing={chevron}
                onPress={() => router.push(APPEARANCE_ROUTE)}
                testID="you-edit-appearance"
              />
            </ListCard>
          </View>
        </View>
      </PushScreen>
      {edit.editing === 'name' && draft !== null ? (
        <NamePremiumSheet
          value={draft.name}
          onDone={(name) => {
            edit.setEdits((e) => ({ ...e, name }));
            edit.setEditing(null);
          }}
          onClose={() => edit.setEditing(null)}
        />
      ) : null}
      {edit.editing === 'username' && saved !== null && draft !== null ? (
        <UsernamePremiumSheet
          saved={saved}
          draft={draft}
          onDone={(next) => {
            edit.setEdits((e) => ({ ...e, username: next }));
            edit.setEditing(null);
          }}
          onClose={() => edit.setEditing(null)}
        />
      ) : null}
      {edit.editing === 'home-airport' ? (
        <AirportPremiumSheet
          onDone={(iata) => {
            edit.setEdits((e) => ({ ...e, homeAirport: iata }));
            edit.setEditing(null);
          }}
          onClose={() => edit.setEditing(null)}
        />
      ) : null}
      {edit.editing === 'languages' && draft !== null ? (
        <LanguagesPremiumSheet
          value={draft.languages}
          choices={languageChoices(locale).map((choice) => ({
            code: choice.code,
            name: choice.nativeName,
            line: choice.localName,
          }))}
          onDone={(languages) => {
            edit.setEdits((e) => ({ ...e, languages }));
            edit.setEditing(null);
          }}
          onClose={() => edit.setEditing(null)}
        />
      ) : null}
    </>
  );
}
