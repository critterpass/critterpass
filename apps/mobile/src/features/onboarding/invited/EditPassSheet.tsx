/**
 * "Change anything" on 3a-12: the invitee corrects the name the inviter typed or picks their own
 * home airport, searching the same bundled airports as the regular home page (3a-5). A code joiner
 * arrives with neither, so the sheet also asks for both: its button reads what is still missing,
 * the picked home stays on show with the keyboard put away, and the button is in reach again.
 * Undesigned; built from the sheet, text field and search field (docs/undesigned-states.md).
 */
import { t } from '@lingui/core/macro';
import { useDeferredValue, useMemo, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';

import { givenNameProblem, homeBaseFor } from '@cp/domain';

import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { SearchField } from '@/ui/inputs/SearchField';
import { TextField } from '@/ui/inputs/TextField';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { airportDataset, BLOCKED_NAME_WORDS } from '../content';
import { homeResults } from '../home/home-search';
import { missingPassPart, passAskLabel } from './pass-missing';

const MAX_ROWS = 6;

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['16'], padding: th.space['20'] },
  row: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: th.space['16'],
    paddingVertical: th.space['12'],
    borderRadius: th.radius.lg,
    borderWidth: 2,
    borderColor: th.color.yellow,
    backgroundColor: th.semantic.bg.raised,
  },
  pickedText: { flex: 1 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.yellow,
  },
}));

export interface EditPassSheetProps {
  readonly name: string;
  readonly homeIata: string | null;
  readonly onDone: (next: { readonly name: string; readonly homeIata: string | null }) => void;
  readonly onClose: () => void;
}

export function EditPassSheet({ name, homeIata, onDone, onClose }: EditPassSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [draftName, setDraftName] = useState(name);
  const [home, setHome] = useState(homeIata);
  const [query, setQuery] = useState('');
  // The search runs on the deferred query, so a keystroke's render never lags the typed text.
  const searched = useDeferredValue(query);
  const rows = useMemo(
    () => homeResults(airportDataset(), searched, null, MAX_ROWS).rows,
    [searched],
  );
  const problem = givenNameProblem(draftName, BLOCKED_NAME_WORDS);
  const missing = missingPassPart({ given_name: draftName, home_iata: home });
  const picked = home === null ? null : homeBaseFor(airportDataset(), home);
  // The search and the keyboard make way for the pick, so the button under it is in reach.
  const pick = (iata: string) => {
    setHome(iata);
    setQuery('');
    Keyboard.dismiss();
  };

  return (
    <Sheet detents={['large']} onDismiss={onClose} testID="invite-edit-pass">
      <View style={styles.body}>
        <TextField
          label={t({ id: 'onboarding.invite.pass.editName', message: 'Given name' })}
          value={draftName}
          onChangeText={setDraftName}
          // An empty name is asked for by the button, not marked as a mistake.
          status={problem === null || problem === 'empty' ? 'idle' : 'error'}
          returnKeyType="done"
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
                    onPress={() => pick(iata)}
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
        {picked !== null && query.length === 0 ? (
          <View
            accessible
            accessibilityState={{ selected: true }}
            style={styles.picked}
            testID="invite-edit-home-picked"
          >
            <Text variant="rowTitle" style={styles.pickedText} numberOfLines={1}>
              {`${picked.city} · ${picked.iata}`}
            </Text>
            <View style={styles.check}>
              <Icon name="check" size={16} color={theme.color.ink['950']} decorative />
            </View>
          </View>
        ) : null}
        <PillButton
          label={
            missing === null
              ? t({ id: 'onboarding.invite.pass.editDone', message: 'Done' })
              : passAskLabel(missing)
          }
          onPress={() => onDone({ name: draftName.trim(), homeIata: home })}
          disabled={missing !== null || problem !== null}
          block
          testID="invite-edit-done"
        />
      </View>
    </Sheet>
  );
}
