/** Naming a new saved list or renaming one: one field, the action and a way out. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { useTheme } from '@/ui/theme';

export type ListEditor = {
  readonly kind: 'new' | 'rename';
  readonly name: string;
  /** The viewer already has a list with this name. */
  readonly taken: boolean;
} | null;

export interface SavedListEditorProps {
  readonly editor: NonNullable<ListEditor>;
  readonly onChange: (name: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}

export function SavedListEditor({ editor, onChange, onSubmit, onCancel }: SavedListEditorProps) {
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View style={{ gap: theme.space['8'] }} testID="explore-saved-editor">
      <TextField
        label={
          editor.kind === 'new'
            ? t({ id: 'explore.saved.newName', message: 'Name the new list' })
            : t({ id: 'explore.saved.renameName', message: 'Rename this list' })
        }
        value={editor.name}
        onChangeText={onChange}
        {...(editor.taken
          ? {
              status: 'error' as const,
              message: t({
                id: 'explore.saved.nameTaken',
                message: 'You already have a list with that name.',
              }),
            }
          : {})}
        testID="explore-saved-editor-name"
      />
      <Row gap="12" align="center">
        <PillButton
          label={
            editor.kind === 'new'
              ? t({ id: 'explore.saved.create', message: 'Create list' })
              : t({ id: 'explore.saved.rename', message: 'Rename' })
          }
          size="sm"
          block={false}
          disabled={editor.name.trim() === ''}
          onPress={onSubmit}
          testID="explore-saved-editor-submit"
        />
        <TextLink
          label={t({ id: 'explore.saved.cancel', message: 'Cancel' })}
          onPress={onCancel}
          testID="explore-saved-editor-cancel"
        />
      </Row>
    </View>
  );
}
