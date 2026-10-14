/**
 * The edit page's four fields as native page sheets (9.02 rows open them): name and username as
 * one field each with its live line, the home airport by search, and languages ticked in order
 * (the first is the main one). Done saves the field into the page's draft; Save in the page's
 * header keeps it. A sheet with a change not yet done asks before Cancel, back or a swipe drops it.
 */
import { airportDataset } from '@cp/content/airports';
import { hitIata, PROFILE_LANGUAGES_MAX, searchAirports, type AirportHit } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon, ListCard, Row, SearchField, TextField, usePremiumTheme } from '@/ui/premium';

import { nameProblemText, usernameText } from '../../edit-profile/edit-profile-copy';
import {
  nameProblemOf,
  type ProfileDraft,
  type SavedProfile,
} from '../../edit-profile/edit-profile-model';
import { useUsernameState } from '../../edit-profile/username-check';
import { PageSheet } from '../components/page-sheet';

function useSheetWords() {
  const { t } = useLingui();
  return {
    cancel: t({ id: 'you.premium.edit.cancel', message: 'Cancel' }),
    done: t({ id: 'you.edit.done', message: 'Done' }),
  };
}

export function NamePremiumSheet(props: {
  readonly value: string;
  readonly onDone: (name: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const words = useSheetWords();
  const [name, setName] = useState(props.value);
  const problem = nameProblemOf(name);
  const title = t({ id: 'you.edit.name', message: 'Name' });
  return (
    <PageSheet
      title={title}
      cancelLabel={words.cancel}
      onCancel={props.onClose}
      dirty={name !== props.value}
      verb={{
        label: words.done,
        disabled: problem !== null,
        onPress: () => props.onDone(name),
        testID: 'you-edit-name-done',
      }}
      testID="you-edit-name-sheet"
    >
      <TextField
        accessibilityLabel={title}
        value={name}
        onChangeText={setName}
        autoFocus
        autoCapitalize="words"
        error={problem === null ? undefined : nameProblemText(problem)}
        onSubmitEditing={() => {
          if (problem === null) props.onDone(name);
        }}
        testID="you-edit-name-field"
      />
    </PageSheet>
  );
}

export function UsernamePremiumSheet(props: {
  readonly saved: SavedProfile;
  readonly draft: ProfileDraft;
  readonly onDone: (username: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const words = useSheetWords();
  const locale = useLocale();
  const [username, setUsername] = useState(props.draft.username);
  const state = useUsernameState(props.saved, { ...props.draft, username });
  const line = usernameText(state, locale) ?? undefined;
  const bad = state.kind === 'invalid' || state.kind === 'cooldown' || state.kind === 'taken';
  const title = t({ id: 'you.edit.username', message: 'Username' });
  return (
    <PageSheet
      title={title}
      cancelLabel={words.cancel}
      onCancel={props.onClose}
      dirty={username !== props.draft.username}
      verb={{
        label: words.done,
        disabled: bad,
        onPress: () => props.onDone(username),
        testID: 'you-edit-username-done',
      }}
      testID="you-edit-username-sheet"
    >
      <TextField
        accessibilityLabel={title}
        value={username}
        onChangeText={(text) => setUsername(text.replace(/^@/, ''))}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        {...(bad ? { error: line } : { helper: line })}
        testID="you-edit-username-field"
      />
    </PageSheet>
  );
}

function airportLine(hit: AirportHit): string {
  return hit.kind === 'airport'
    ? `${hit.airport.iata} · ${hit.airport.name}`
    : `${hit.metro.iata} · ${hit.metro.city}`;
}

export function AirportPremiumSheet(props: {
  readonly onDone: (iata: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const words = useSheetWords();
  const [query, setQuery] = useState('');
  const hits = searchAirports(airportDataset(), query, 6);
  const search = t({ id: 'you.edit.airportSearch', message: 'City or airport code' });
  return (
    <PageSheet
      title={t({ id: 'you.edit.homeAirport', message: 'Home airport' })}
      cancelLabel={words.cancel}
      onCancel={props.onClose}
      testID="you-edit-airport-sheet"
    >
      <SearchField
        accessibilityLabel={search}
        placeholder={search}
        value={query}
        onChangeText={setQuery}
        autoFocus
        autoCorrect={false}
        testID="you-edit-airport-search"
      />
      {hits.length > 0 ? (
        <ListCard radius={20}>
          {hits.map((hit) => (
            <Row
              key={hitIata(hit)}
              title={airportLine(hit)}
              onPress={() => props.onDone(hitIata(hit))}
              testID={`you-edit-airport-${hitIata(hit)}`}
            />
          ))}
        </ListCard>
      ) : null}
    </PageSheet>
  );
}

export function LanguagesPremiumSheet(props: {
  readonly value: readonly string[];
  readonly choices: readonly {
    readonly code: string;
    readonly name: string;
    readonly line: string;
  }[];
  readonly onDone: (languages: string[]) => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const words = useSheetWords();
  const [picked, setPicked] = useState<string[]>([...props.value]);
  const toggle = (code: string) =>
    setPicked((now) =>
      now.includes(code)
        ? now.filter((item) => item !== code)
        : now.length >= PROFILE_LANGUAGES_MAX
          ? now
          : [...now, code],
    );
  return (
    <PageSheet
      title={t({ id: 'you.edit.languages', message: 'Languages' })}
      cancelLabel={words.cancel}
      onCancel={props.onClose}
      dirty={picked.join() !== props.value.join()}
      verb={{
        label: words.done,
        onPress: () => props.onDone(picked),
        testID: 'you-edit-languages-done',
      }}
      testID="you-edit-languages-sheet"
    >
      <ListCard radius={20} testID="you-edit-languages">
        {props.choices.map((choice) => (
          <Row
            key={choice.code}
            title={choice.name}
            subtitle={choice.line}
            trailing={
              picked.includes(choice.code) ? (
                <Icon name="check" size={18} color={th.color.ink} />
              ) : undefined
            }
            onPress={() => toggle(choice.code)}
            testID={`you-edit-languages-${choice.code}`}
          />
        ))}
      </ListCard>
    </PageSheet>
  );
}
