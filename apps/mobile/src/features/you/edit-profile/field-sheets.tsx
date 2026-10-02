/**
 * The sheets the edit profile rows open (undesigned; built from the sheet, text and search fields
 * and pill buttons): one field each, DONE puts the value in the draft. Nothing is sent until SAVE.
 */
import { airportDataset } from '@cp/content/airports';
import { hitIata, PROFILE_LANGUAGES_MAX, searchAirports, type AirportHit } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ListCard } from '@/ui/cards/ListCard';
import { SearchField } from '@/ui/inputs/SearchField';
import { SettingsGroup } from '@/ui/inputs/SettingsGroup';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { makeStyles } from '@/ui/theme';

import { nameProblemText, usernameText } from './edit-profile-copy';
import { nameProblemOf, type ProfileDraft, type SavedProfile } from './edit-profile-model';
import { useUsernameState, type UsernameLookup } from './username-check';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['20'], gap: t.space['14'] },
}));

export function NameSheet(props: {
  readonly value: string;
  readonly onDone: (name: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const [name, setName] = useState(props.value);
  const problem = nameProblemOf(name);
  const title = t({ id: 'you.edit.name', message: 'Name' });
  return (
    <Sheet detents={['fit']} title={title} onDismiss={props.onClose} testID="you-edit-name-sheet">
      <View style={styles.body}>
        <TextField
          label={title}
          labelHidden
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          status={problem === null ? 'idle' : 'error'}
          {...(problem === null ? {} : { message: nameProblemText(problem) })}
          testID="you-edit-name-field"
        />
        <PillButton
          label={t({ id: 'you.edit.done', message: 'Done' })}
          disabled={problem !== null}
          onPress={() => props.onDone(name)}
          testID="you-edit-name-done"
        />
      </View>
    </Sheet>
  );
}

export function UsernameSheet(props: {
  readonly saved: SavedProfile;
  readonly draft: ProfileDraft;
  readonly lookup?: UsernameLookup;
  readonly onDone: (username: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const locale = useLocale();
  const [username, setUsername] = useState(props.draft.username);
  const state = useUsernameState(props.saved, { ...props.draft, username }, props.lookup);
  const line = usernameText(state, locale);
  const bad = state.kind === 'invalid' || state.kind === 'cooldown' || state.kind === 'taken';
  const title = t({ id: 'you.edit.username', message: 'Username' });
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={props.onClose}
      testID="you-edit-username-sheet"
    >
      <View style={styles.body}>
        <TextField
          label={title}
          labelHidden
          value={username}
          onChangeText={(text) => setUsername(text.replace(/^@/, ''))}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          status={bad ? 'error' : state.kind === 'available' ? 'valid' : 'idle'}
          {...(line === null ? {} : { message: line })}
          testID="you-edit-username-field"
        />
        <PillButton
          label={t({ id: 'you.edit.done', message: 'Done' })}
          disabled={bad}
          onPress={() => props.onDone(username)}
          testID="you-edit-username-done"
        />
      </View>
    </Sheet>
  );
}

function airportLine(hit: AirportHit): string {
  return hit.kind === 'airport'
    ? `${hit.airport.iata} · ${hit.airport.name}`
    : `${hit.metro.iata} · ${hit.metro.city}`;
}

export function AirportSheet(props: {
  readonly onDone: (iata: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const hits = searchAirports(airportDataset(), query, 6);
  const title = t({ id: 'you.edit.homeAirport', message: 'Home airport' });
  return (
    <Sheet
      detents={['large']}
      title={title}
      onDismiss={props.onClose}
      testID="you-edit-airport-sheet"
    >
      <View style={styles.body}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'you.edit.airportSearch', message: 'City or airport code' })}
          autoFocus
          testID="you-edit-airport-search"
          results={
            hits.length > 0 ? (
              <Stack gap="8">
                {hits.map((hit) => (
                  <ListCard
                    key={hitIata(hit)}
                    title={airportLine(hit)}
                    onPress={() => props.onDone(hitIata(hit))}
                    testID={`you-edit-airport-${hitIata(hit)}`}
                  />
                ))}
              </Stack>
            ) : undefined
          }
        />
      </View>
    </Sheet>
  );
}

/** The languages the person speaks: tick any, in the order ticked (the first is their main one). */
export function LanguagesSheet(props: {
  readonly value: readonly string[];
  readonly choices: readonly {
    readonly code: string;
    readonly name: string;
    readonly line: string;
  }[];
  readonly onDone: (languages: string[]) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const [picked, setPicked] = useState<string[]>([...props.value]);
  const title = t({ id: 'you.edit.languages', message: 'Languages' });
  const toggle = (code: string) =>
    setPicked((now) =>
      now.includes(code)
        ? now.filter((item) => item !== code)
        : now.length >= PROFILE_LANGUAGES_MAX
          ? now
          : [...now, code],
    );
  return (
    <Sheet
      detents={['large']}
      title={title}
      onDismiss={props.onClose}
      testID="you-edit-languages-sheet"
    >
      <SheetScrollView contentContainerStyle={styles.body}>
        <SettingsGroup
          rows={props.choices.map((choice) => ({
            key: choice.code,
            kind: 'check' as const,
            title: choice.name,
            subtitle: choice.line,
            checked: picked.includes(choice.code),
            onPress: () => toggle(choice.code),
          }))}
          testID="you-edit-languages"
        />
        <PillButton
          label={t({ id: 'you.edit.done', message: 'Done' })}
          onPress={() => props.onDone(picked)}
          testID="you-edit-languages-done"
        />
      </SheetScrollView>
    </Sheet>
  );
}
