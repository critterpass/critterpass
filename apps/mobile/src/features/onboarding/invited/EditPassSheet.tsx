/**
 * "Change anything" on 3a-12: the invitee corrects the name the inviter typed or picks their own
 * home airport, searching the same bundled airports as the regular home page (3a-5). Undesigned;
 * built from the sheet, text field and search field (docs/undesigned-states.md).
 */
import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { givenNameProblem } from '@cp/domain';

import { PillButton } from '@/ui/buttons/PillButton';
import { SearchField } from '@/ui/inputs/SearchField';
import { TextField } from '@/ui/inputs/TextField';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET } from '@/ui/theme';

import { airportDataset, BLOCKED_NAME_WORDS } from '../content';
import { homeResults } from '../home/home-search';

const MAX_ROWS = 6;

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['16'], padding: th.space['20'] },
  row: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
}));

export interface EditPassSheetProps {
  readonly name: string;
  readonly homeIata: string | null;
  readonly onDone: (next: { readonly name: string; readonly homeIata: string | null }) => void;
  readonly onClose: () => void;
}

export function EditPassSheet({ name, homeIata, onDone, onClose }: EditPassSheetProps) {
  const styles = useStyles();
  const [draftName, setDraftName] = useState(name);
  const [home, setHome] = useState(homeIata);
  const [query, setQuery] = useState('');
  const rows = useMemo(
    () => homeResults(airportDataset(), query, null).rows.slice(0, MAX_ROWS),
    [query],
  );
  const problem = givenNameProblem(draftName, BLOCKED_NAME_WORDS);

  return (
    <Sheet detents={['large']} onDismiss={onClose} testID="invite-edit-pass">
      <View style={styles.body}>
        <TextField
          label={t({ id: 'onboarding.invite.pass.editName', message: 'Given name' })}
          value={draftName}
          onChangeText={setDraftName}
          status={problem === null ? 'idle' : 'error'}
          testID="invite-edit-name"
        />
        <SearchField
          value={query}
          onChangeText={setQuery}
          label={t({ id: 'onboarding.invite.pass.editHome', message: 'Home airport' })}
          testID="invite-edit-home"
          results={
            <View>
              {rows.map((row) => {
                const iata = row.kind === 'airport' ? row.airport.iata : row.metro.iata;
                const label =
                  row.kind === 'airport'
                    ? `${row.airport.city} · ${row.airport.iata}`
                    : `${row.metro.city} · ${row.metro.iata}`;
                return (
                  <Pressable
                    key={`${row.kind}-${iata}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: home === iata }}
                    onPress={() => setHome(iata)}
                    style={styles.row}
                    testID={`invite-edit-home-${iata}`}
                  >
                    <Text variant="rowTitle">{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          }
        />
        <PillButton
          label={t({ id: 'onboarding.invite.pass.editDone', message: 'Done' })}
          onPress={() => onDone({ name: draftName.trim(), homeIata: home })}
          disabled={problem !== null}
          block
          testID="invite-edit-done"
        />
      </View>
    </Sheet>
  );
}
