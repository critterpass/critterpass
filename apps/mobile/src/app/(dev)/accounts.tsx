import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { DevSettings, ScrollView } from 'react-native';

import { createDevSlots, type DevSlot } from '@/data/auth/dev-slots';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { clearPassDraft } from '@/features/onboarding';
import { setOnboardingComplete } from '@/lib/links/pending';
import { forgetNavigationForAccountSwitch } from '@/lib/navigation/restore';
import { makeStyles, Scaffold, Stack, Text, useTheme } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';

const slots = createDevSlots(SecureStore);

interface Current {
  readonly uid: string;
  readonly name: string;
}

async function readCurrent(): Promise<Current | null> {
  const { startDeviceAppSession } = await import('@/data/app-session/device-session');
  const { db } = (await startDeviceAppSession()).localFirst;
  const owner = await db.getOptional<{ value: string }>(
    'SELECT value FROM local_state WHERE id = ?',
    [OWNER_UID_KEY],
  );
  if (owner === null) return null;
  const user = await db.getOptional<{ display_name: string | null }>(
    'SELECT display_name FROM users WHERE id = ?',
    [owner.value],
  );
  return { uid: owner.value, name: user?.display_name ?? owner.value.slice(0, 8) };
}

/** Restarts the JS so the app boots with the session now in storage. */
async function reload(): Promise<void> {
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}

/**
 * Test accounts (Developer tools): device flows that need two people on one phone keep the
 * signed-in account, start a brand-new one, and switch back. Every switch clears this phone's
 * local data first and restarts the app (data/auth/dev-slots.ts).
 */
export default function DevAccountsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const [current, setCurrent] = useState<Current | null>(null);
  const [kept, setKept] = useState<readonly DevSlot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([readCurrent(), slots.list()]).then(([signedIn, list]) => {
      if (!live) return;
      setCurrent(signedIn);
      setKept(list);
    });
    return () => {
      live = false;
    };
  }, [version]);

  const run = async (target: string | null) => {
    setBusy(true);
    setError(null);
    try {
      if (current !== null) await slots.keep(current.uid, current.name);
      await slots.switchTo(target);
      // The restart starts at Home (not this screen), where a brand-new account's gate sends
      // it to onboarding.
      forgetNavigationForAccountSwitch();
      // A brand-new account onboards (name, guide, home) like a new phone; a kept one is past it.
      setOnboardingComplete(target !== null);
      if (target === null) clearPassDraft();
      await reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stack gap="4">
          <Text variant="h2" accessibilityRole="header">
            Test accounts
          </Text>
          <SecondaryText variant="caption" testID="dev-accounts-current">
            {current === null ? 'Not signed in' : `Signed in: ${current.name}`}
          </SecondaryText>
        </Stack>
        <ListCard
          testID="dev-accounts-new"
          title="Keep this account, start a new one"
          chevron={false}
          {...(busy ? {} : { onPress: () => void run(null) })}
        />
        {kept.map((slot, index) =>
          slot.uid === current?.uid ? null : (
            <ListCard
              key={slot.uid}
              testID={`dev-accounts-switch-${index}`}
              title={`Switch to ${slot.label}`}
              chevron={false}
              {...(busy ? {} : { onPress: () => void run(slot.uid) })}
            />
          ),
        )}
        <ListCard
          testID="dev-accounts-clear"
          title="Forget kept accounts"
          chevron={false}
          onPress={() => void slots.clear().then(() => setVersion((v) => v + 1))}
        />
        {error === null ? null : (
          <Text testID="dev-accounts-failed" color={theme.semantic.state.urgent}>
            {error}
          </Text>
        )}
      </ScrollView>
    </Scaffold>
  );
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['16'] },
}));
