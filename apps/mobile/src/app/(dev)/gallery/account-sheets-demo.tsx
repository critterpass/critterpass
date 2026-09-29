import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import type { MergePreviewSummary } from '@/data/auth';
import { DeclinedMergeNote, MergeSheet } from '@/features/onboarding/save/MergeSheet';
import { SaveSheet } from '@/features/onboarding/save/SaveSheet';
import type { MergeContext, SaveState } from '@/features/onboarding/save/use-save-flow';
import { makeStyles, MIN_TOUCH_TARGET, Scaffold, Text } from '@/ui';

export const __CP_DEV_ROUTE__ = true;

/** What an older pass holds, as the merge preview reports it. */
const PREVIEW: MergePreviewSummary = {
  crews: [
    { id: 'demo-crew-1', name: 'Bali demo crew', owner: 'existing' },
    { id: 'demo-crew-2', name: 'Hehe', owner: 'anon' },
  ],
  trips: [],
};
const GOOGLE: MergeContext = { provider: 'google', ticket: 'demo-ticket', preview: PREVIEW };

type Surface = 'save' | 'phone';
type Shown = { readonly surface: Surface; readonly state: SaveState } | null;

const STATES: readonly { id: string; label: string; surface: Surface; state: SaveState }[] = [
  { id: 'save-idle', label: 'Save sheet', surface: 'save', state: { kind: 'idle' } },
  {
    id: 'save-error',
    label: 'Save sheet: Google stopped',
    surface: 'save',
    state: { kind: 'error', provider: 'google', reason: 'cancelled' },
  },
  {
    id: 'save-merge',
    label: 'Save sheet: you already have a pass',
    surface: 'save',
    state: { kind: 'merge', ...GOOGLE },
  },
  {
    id: 'save-kept',
    label: 'Save sheet: keeping the new pass',
    surface: 'save',
    state: { kind: 'kept', ...GOOGLE },
  },
  {
    id: 'save-declined',
    label: 'Save sheet: after keeping the new pass',
    surface: 'save',
    state: { kind: 'declined', ...GOOGLE },
  },
  {
    id: 'phone-merge',
    label: 'Phone page: you already have a pass',
    surface: 'phone',
    state: { kind: 'merge', ...GOOGLE },
  },
  {
    id: 'phone-kept',
    label: 'Phone page: keeping the new pass',
    surface: 'phone',
    state: { kind: 'kept', ...GOOGLE },
  },
];

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['12'] },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.space['14'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    justifyContent: 'center',
  },
}));

/**
 * The account sheets from onboarding in every merge state, over a plain page: the real SaveSheet
 * and MergeSheet with injected state. Choices move between the states as they do in the app;
 * signing in and switching are no-ops here (no network).
 */
export default function AccountSheetsDemoScreen() {
  const styles = useStyles();
  const [shown, setShown] = useState<Shown>(null);
  const [declined, setDeclined] = useState(false);
  const noop = () => undefined;
  const show = (surface: Surface, state: SaveState) => setShown({ surface, state });
  const merge = (kind: 'merge' | 'kept' | 'declined') => ({ kind, ...GOOGLE }) as const;

  return (
    <>
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="account-sheets-demo">
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="h2" accessibilityRole="header">
            Account sheets
          </Text>
          {STATES.map((row) => (
            <Pressable
              key={row.id}
              testID={`account-sheets-${row.id}`}
              accessibilityRole="button"
              style={styles.row}
              onPress={() => {
                setDeclined(false);
                show(row.surface, row.state);
              }}
            >
              <Text variant="rowTitle">{row.label}</Text>
            </Pressable>
          ))}
          {declined ? (
            <View testID="account-sheets-phone-declined">
              <DeclinedMergeNote
                state={GOOGLE}
                onSwitch={() => {
                  setDeclined(false);
                  show('phone', merge('merge'));
                }}
              />
            </View>
          ) : null}
        </ScrollView>
      </Scaffold>
      {shown?.surface === 'save' ? (
        <SaveSheet
          state={shown.state}
          onApple={noop}
          onGoogle={noop}
          onPhone={noop}
          onNotNow={() => setShown(null)}
          onUseExisting={noop}
          onKeepNew={() => show('save', merge('kept'))}
          onKeptDone={() => show('save', merge('declined'))}
          onReopenMerge={() => show('save', merge('merge'))}
        />
      ) : null}
      {shown?.surface === 'phone' ? (
        <MergeSheet
          state={shown.state}
          onUseExisting={noop}
          onKeepNew={() => show('phone', merge('kept'))}
          onClose={() => {
            setShown(null);
            setDeclined(true);
          }}
        />
      ) : null}
    </>
  );
}
