/**
 * Starting a crew on the spot, from a place page: someone with no crew who wants to pitch a place
 * gets a name (already filled in, hers to change) and one button. The crew is created through the
 * same command as the start-a-crew screen (`create_crew`, queued like every offline command); once it has reached the server and synced back, the
 * caller carries on with it (the pitch). Offline the crew waits in the queue and the line says so.
 */
import { CREW_NAME_MAX, crewNameSchema, generateUuidV7, normaliseCrewName } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useIsFocused } from 'expo-router';
import { useContext, useEffect, useRef, useState } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { createCrewCommand } from '../data/vote-commands';

export interface QuickCrewStartProps {
  /** The place being pitched: the crew's name starts as "{place} crew". */
  readonly placeName: string;
  /** The ids of the crews this user is in, from the local database. */
  readonly crewIds: readonly string[];
  /** The crew was sent to be created (the caller keeps this mounted until `onReady`). */
  readonly onStarted: () => void;
  /** The new crew exists on the server and locally. */
  readonly onReady: (crewId: string) => void;
  readonly testID: string;
}

/** "{place} crew", cut to what a crew name allows. */
export function defaultCrewName(label: string): string {
  return normaliseCrewName(label).slice(0, CREW_NAME_MAX).trim();
}

function OfflineLine({ testID }: { readonly testID: string }) {
  const { t } = useLingui();
  const theme = useTheme();
  const syncPhase = useSyncPhase();
  if (syncPhase !== 'offline') return null;
  return (
    <Text variant="bodySm" color={theme.semantic.text.secondary} testID={`${testID}-offline`}>
      {t({
        id: 'vote.quickCrew.offline',
        message: 'You’re offline. The crew is saved; the pitch opens once you’re back online.',
      })}
    </Text>
  );
}

export function QuickCrewStart(props: QuickCrewStartProps) {
  const { placeName, crewIds, onStarted, onReady, testID } = props;
  const { t } = useLingui();
  const theme = useTheme();
  const localFirst = useContext(LocalFirstContext);
  const [name, setName] = useState(() =>
    defaultCrewName(t({ id: 'vote.quickCrew.defaultName', message: `${placeName} crew` })),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const valid = crewNameSchema.safeParse(name).success;

  // The crew has synced back: hand it to the caller once (the button keeps spinning until the
  // caller has moved on).
  const arrived = pending !== null && crewIds.includes(pending) ? pending : null;
  const handed = useRef<string | null>(null);
  // Only while this page is on top: if she has gone elsewhere, the pitch does not open over it.
  const focused = useIsFocused();
  useEffect(() => {
    if (arrived === null || !focused || handed.current === arrived) return;
    handed.current = arrived;
    onReady(arrived);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per crew, whatever the caller's closure.
  }, [arrived, focused]);

  const start = () => {
    if (localFirst === null || !valid || pending !== null) return;
    const crewId = generateUuidV7();
    setFailed(false);
    setPending(crewId);
    onStarted();
    void localFirst.commands
      .send(createCrewCommand, { crew_id: crewId, name: normaliseCrewName(name), art: 'tokek' })
      .then((sent) => {
        if (sent.kind === 'applied' || sent.kind === 'queued') return;
        setPending(null);
        setFailed(true);
      });
  };

  return (
    <Stack gap="10" testID={testID}>
      <Text variant="bodySm">
        {t({
          id: 'vote.quickCrew.body',
          message: 'A pitch goes to a crew. Name yours now and invite people after.',
        })}
      </Text>
      <TextField
        label={t({ id: 'vote.quickCrew.name', message: 'Crew name' })}
        value={name}
        onChangeText={(next) => setName(next.slice(0, CREW_NAME_MAX))}
        returnKeyType="done"
        testID={`${testID}-name`}
      />
      {failed ? (
        <Text variant="bodySm" color={theme.semantic.state.urgent} testID={`${testID}-failed`}>
          {t({ id: 'vote.quickCrew.failed', message: 'That didn’t go through. Try again?' })}
        </Text>
      ) : null}
      {pending !== null && localFirst !== null ? <OfflineLine testID={testID} /> : null}
      <PillButton
        label={t({ id: 'vote.quickCrew.start', message: 'Start the crew and pitch' })}
        onPress={start}
        disabled={!valid || localFirst === null}
        loading={pending !== null}
        testID={`${testID}-start`}
      />
    </Stack>
  );
}
