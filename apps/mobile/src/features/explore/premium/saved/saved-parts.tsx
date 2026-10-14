/**
 * Pieces of the premium saved places page: the list chips (All, each list with its count, New
 * list), the field that names or renames a list, and a row's Move / Remove actions with the lists
 * to move it to.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { Button, PressableScale, Text, TextButton, TextField, usePremiumTheme } from '@/ui/premium';

import type { ListEditor } from '../../screens/saved-screen';
import type { ListChoice } from '../../screens/saved-screen';
import { ALL_LISTS, type ListSummary, type SavedRow } from '../../saved-model';

export function Chip(props: {
  readonly label: string;
  readonly on: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.on }}
      accessibilityLabel={props.label}
      testID={props.testID}
      style={{
        height: 34,
        borderRadius: 17,
        paddingHorizontal: 13,
        justifyContent: 'center',
        backgroundColor: props.on ? theme.color.inkSurface : theme.color.control,
      }}
    >
      <Text variant="segment" tone={props.on ? 'onInk' : 'ink'} numberOfLines={1}>
        {props.label}
      </Text>
    </PressableScale>
  );
}

export function ListChips(props: {
  readonly lists: readonly ListSummary[];
  readonly total: number;
  readonly choice: ListChoice;
  readonly listLabel: (name: string | null) => string;
  readonly onChoose: (choice: ListChoice) => void;
  readonly onNewList: () => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.space.gap6, paddingHorizontal: theme.space.gutter }}
      testID="explore-saved-lists"
    >
      <Chip
        label={`${t({ id: 'explore.saved.all', message: 'All' })} ${String(props.total)}`}
        on={props.choice === ALL_LISTS}
        onPress={() => props.onChoose(ALL_LISTS)}
        testID="explore-saved-list-all"
      />
      {props.lists.map((list) => (
        <Chip
          key={list.name ?? ''}
          label={`${props.listLabel(list.name)} ${String(list.count)}`}
          on={props.choice === list.name}
          onPress={() => props.onChoose(list.name)}
          testID={`explore-saved-list-${list.name ?? 'default'}`}
        />
      ))}
      <Chip
        label={t({ id: 'explore.saved.newList', message: '+ New list' })}
        on={false}
        onPress={props.onNewList}
        testID="explore-saved-new-list"
      />
    </ScrollView>
  );
}

export function ListNameField(props: {
  readonly editor: NonNullable<ListEditor>;
  readonly onChange: (name: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { editor } = props;
  const label =
    editor.kind === 'new'
      ? t({ id: 'explore.saved.newName', message: 'Name the new list' })
      : t({ id: 'explore.saved.renameName', message: 'Rename this list' });
  return (
    <View style={{ gap: theme.space.gap8 }} testID="explore-saved-editor">
      <TextField
        value={editor.name}
        onChangeText={props.onChange}
        onSubmitEditing={props.onSubmit}
        placeholder={label}
        accessibilityLabel={label}
        autoFocus
        returnKeyType="done"
        {...(editor.taken
          ? {
              error: t({
                id: 'explore.saved.nameTaken',
                message: 'You already have a list with that name.',
              }),
            }
          : {})}
        testID="explore-saved-editor-name"
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap16 }}>
        <Button
          alignSelf="auto"
          label={
            editor.kind === 'new'
              ? t({ id: 'explore.saved.create', message: 'Create list' })
              : t({ id: 'explore.saved.rename', message: 'Rename' })
          }
          size="medium"
          disabled={editor.name.trim() === ''}
          onPress={props.onSubmit}
          testID="explore-saved-editor-submit"
        />
        <TextButton
          label={t({ id: 'explore.saved.cancel', message: 'Cancel' })}
          onPress={props.onCancel}
          testID="explore-saved-editor-cancel"
        />
      </View>
    </View>
  );
}

export function RowActions(props: {
  readonly row: SavedRow;
  readonly moving: boolean;
  readonly lists: readonly ListSummary[];
  readonly listLabel: (name: string | null) => string;
  readonly onMove: (row: SavedRow) => void;
  readonly onMoveTo: (row: SavedRow, list: string | null) => void;
  readonly onRemove: (row: SavedRow) => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { row } = props;
  return (
    <View
      style={{
        gap: theme.space.gap8,
        paddingHorizontal: theme.space.gap16,
        paddingBottom: theme.space.gap12,
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.space.gap6 }}>
        <Chip
          label={t({ id: 'explore.saved.move', message: 'Move' })}
          on={props.moving}
          onPress={() => props.onMove(row)}
          testID={`explore-saved-move-${row.refId}`}
        />
        <Chip
          label={t({ id: 'explore.saved.remove', message: 'Remove' })}
          on={false}
          onPress={() => props.onRemove(row)}
          testID={`explore-saved-remove-${row.refId}`}
        />
      </View>
      {props.moving ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}
          testID="explore-saved-move-to"
        >
          {props.lists
            .filter((list) => list.name !== row.listName)
            .map((list) => (
              <Chip
                key={list.name ?? ''}
                label={props.listLabel(list.name)}
                on={false}
                onPress={() => props.onMoveTo(row, list.name)}
                testID={`explore-saved-move-to-${list.name ?? 'default'}`}
              />
            ))}
        </View>
      ) : null}
    </View>
  );
}
