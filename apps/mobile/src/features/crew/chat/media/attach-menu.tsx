/**
 * The composer's "+" menu: Photo library, Camera and Voice note, then entries other features
 * register (poll, expense, location). A denied camera or library shows the way to Settings with
 * the other source as the fallback; a picker that failed (not a refusal) says so, and the same row
 * tries again.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Text, useTheme } from '@/ui';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { Sheet } from '@/ui/sheet/Sheet';
import { PermissionCard } from '@/ui/states/PermissionCard';
import { makeStyles } from '@/ui/theme';

export interface AttachEntry {
  readonly id: string;
  readonly title: () => string;
  readonly onPress: (crewId: string) => void;
}

const entries = new Map<string, AttachEntry>();

/** Adds an entry under the built-in ones (a poll, an expense, a location); returns its removal. */
export function registerAttachEntry(entry: AttachEntry): () => void {
  entries.set(entry.id, entry);
  return () => {
    if (entries.get(entry.id) === entry) entries.delete(entry.id);
  };
}

export type AttachChoice = 'library' | 'camera' | 'voice';

const useStyles = makeStyles((th) => ({ body: { padding: th.space['16'], gap: th.space['12'] } }));

export function AttachMenu({
  crewId,
  denied,
  failed = false,
  onChoose,
  onOpenSettings,
  onClose,
}: {
  readonly crewId: string;
  /** The source the system refused, if the last pick was denied. */
  readonly denied: 'library' | 'camera' | null;
  /** The last pick failed for a reason other than a refusal. */
  readonly failed?: boolean;
  readonly onChoose: (choice: AttachChoice) => void;
  readonly onOpenSettings: () => void;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const rows: SettingsRow[] = [
    {
      key: 'library',
      kind: 'value',
      title: t({ id: 'chat.attach.library', message: 'Photo library' }),
      value: '',
      onPress: () => onChoose('library'),
    },
    {
      key: 'camera',
      kind: 'value',
      title: t({ id: 'chat.attach.camera', message: 'Camera' }),
      value: '',
      onPress: () => onChoose('camera'),
    },
    {
      key: 'voice',
      kind: 'value',
      title: t({ id: 'chat.attach.voice', message: 'Voice note' }),
      value: '',
      onPress: () => onChoose('voice'),
    },
    ...[...entries.values()].map((entry) => ({
      key: entry.id,
      kind: 'value' as const,
      title: entry.title(),
      value: '',
      onPress: () => {
        onClose();
        entry.onPress(crewId);
      },
    })),
  ];
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={t({ id: 'chat.attach.title', message: 'Add to the chat' })}
      testID="chat-attach"
    >
      <View style={styles.body}>
        {denied === null ? null : (
          <PermissionCard
            title={
              denied === 'camera'
                ? t({ id: 'chat.attach.cameraOff', message: 'The camera is off' })
                : t({ id: 'chat.attach.photosOff', message: 'Photo access is off' })
            }
            body={t({
              id: 'chat.attach.deniedBody',
              message: 'Turn it on in Settings to share photos with the crew.',
            })}
            fallback={
              denied === 'camera'
                ? {
                    label: t({ id: 'chat.attach.useLibrary', message: 'Pick from the library' }),
                    onPress: () => onChoose('library'),
                  }
                : {
                    label: t({ id: 'chat.attach.useCamera', message: 'Take a photo instead' }),
                    onPress: () => onChoose('camera'),
                  }
            }
            onOpenSettings={onOpenSettings}
            testID="chat-attach-denied"
          />
        )}
        {failed ? (
          <Text
            variant="caption"
            color={theme.semantic.state.urgent}
            accessibilityLiveRegion="polite"
            testID="chat-attach-failed"
          >
            {t({ id: 'chat.attach.failed', message: 'Couldn’t open your photos. Try again.' })}
          </Text>
        ) : null}
        <SettingsGroup rows={rows} testID="chat-attach-list" />
      </View>
    </Sheet>
  );
}
