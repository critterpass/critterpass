/**
 * The saved hub, drawn from plain values: the lists as chips with their counts, the chosen list's
 * places grouped by destination (a saved destination first, with its offline pack), and, in edit
 * mode, moving a place to another list or removing it, and renaming or deleting a list.
 */
import { upper } from '@cp/i18n';
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { FilterChip } from '@/ui/chips/FilterChip';
import { Row } from '@/ui/layout/Row';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { EmptyState } from '@/ui/states/EmptyState';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryLabel } from '../category';
import { guideFor } from '../format';
import { ALL_LISTS, type ListSummary, type SavedGroups, type SavedRow } from '../saved-model';
import { SavedListEditor, type ListEditor } from './saved-list-editor';

export type { ListEditor } from './saved-list-editor';

/** Which list is shown: every list (`ALL_LISTS`), the default one (null) or a named one. */
export type ListChoice = string | null;

export interface SavedViewProps {
  readonly lists: readonly ListSummary[];
  readonly total: number;
  readonly choice: ListChoice;
  readonly onChoose: (choice: ListChoice) => void;
  readonly groups: SavedGroups;
  readonly editing: boolean;
  readonly onToggleEditing: () => void;
  /** The row whose "move to" lists are open. */
  readonly movingId: string | null;
  readonly onMove: (row: SavedRow) => void;
  readonly onMoveTo: (row: SavedRow, list: string | null) => void;
  readonly onRemove: (row: SavedRow) => void;
  readonly onOpen: (row: SavedRow) => void;
  readonly editor: ListEditor;
  readonly onNewList: () => void;
  readonly onRenameList: () => void;
  readonly onDeleteList: () => void;
  readonly onEditorChange: (name: string) => void;
  readonly onEditorSubmit: () => void;
  readonly onEditorCancel: () => void;
  readonly onBack: () => void;
  /** Opens Explore to find something to save; absent while that screen is not in the app. */
  readonly onExplore?: (() => void) | undefined;
  /** The offline pack of a saved destination. */
  readonly renderPack: (destination: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  }) => ReactNode;
  readonly plans?: ReactNode;
}

const EMPTY_STICKER = 140;

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, gap: t.space['16'] },
  chips: { flexDirection: 'row', gap: t.space['8'], paddingEnd: t.size.gutter },
  group: { gap: t.space['8'] },
  actions: { paddingStart: t.space['8'], paddingBottom: t.space['4'] },
}));

export function SavedView(props: SavedViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const defaultName = t({ id: 'explore.saved.defaultList', message: 'Saved' });
  const listLabel = (name: string | null) => name ?? defaultName;
  const { groups, editor, choice } = props;
  const named = choice !== null && choice !== ALL_LISTS;
  const empty = groups.groups.length === 0 && groups.unknown === 0;
  const guest = guideFor(null);

  const rowActions = (row: SavedRow) =>
    !props.editing || row.pending ? null : (
      <View style={styles.actions}>
        <Row gap="8" wrap>
          <InlineAction
            kind="choice"
            selected={props.movingId === row.id}
            label={upper(t({ id: 'explore.saved.move', message: 'Move' }), locale)}
            onPress={() => props.onMove(row)}
            testID={`explore-saved-move-${row.refId}`}
          />
          <InlineAction
            kind="ghost"
            label={upper(t({ id: 'explore.saved.remove', message: 'Remove' }), locale)}
            onPress={() => props.onRemove(row)}
            testID={`explore-saved-remove-${row.refId}`}
          />
        </Row>
        {props.movingId !== row.id ? null : (
          <Row gap="8" wrap style={{ marginTop: theme.space['8'] }} testID="explore-saved-move-to">
            {props.lists
              .filter((list) => list.name !== row.listName)
              .map((list) => (
                <InlineAction
                  key={list.name ?? ''}
                  kind="choice"
                  label={listLabel(list.name)}
                  onPress={() => props.onMoveTo(row, list.name)}
                  testID={`explore-saved-move-to-${list.name ?? 'default'}`}
                />
              ))}
          </Row>
        )}
      </View>
    );

  return (
    <Scaffold testID="explore-saved">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.body,
          { paddingTop: theme.space['8'], paddingBottom: insets.bottom + theme.space['24'] },
        ]}
      >
        <Row justify="space-between" align="center">
          <BackEyebrow
            label={t({ id: 'explore.hero.back', message: 'Explore' })}
            onPress={props.onBack}
            testID="explore-back"
          />
          {props.total === 0 ? null : (
            <InlineAction
              kind="ghost"
              label={upper(
                props.editing
                  ? t({ id: 'explore.saved.done', message: 'Done' })
                  : t({ id: 'explore.saved.edit', message: 'Edit' }),
                locale,
              )}
              onPress={props.onToggleEditing}
              testID="explore-saved-edit"
            />
          )}
        </Row>
        <Text variant="h1">
          {upper(t({ id: 'explore.saved.title', message: 'Saved' }), locale)}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            <FilterChip
              label={t({ id: 'explore.saved.all', message: 'All' })}
              count={props.total}
              selected={choice === ALL_LISTS}
              onPress={() => props.onChoose(ALL_LISTS)}
              testID="explore-saved-list-all"
            />
            {props.lists.map((list) => (
              <FilterChip
                key={list.name ?? ''}
                label={listLabel(list.name)}
                count={list.count}
                selected={choice === list.name}
                onPress={() => props.onChoose(list.name)}
                testID={`explore-saved-list-${list.name ?? 'default'}`}
              />
            ))}
            <FilterChip
              label={t({ id: 'explore.saved.newList', message: '+ New list' })}
              selected={editor?.kind === 'new'}
              onPress={props.onNewList}
              testID="explore-saved-new-list"
            />
          </View>
        </ScrollView>
        {editor === null ? null : (
          <SavedListEditor
            editor={editor}
            onChange={props.onEditorChange}
            onSubmit={props.onEditorSubmit}
            onCancel={props.onEditorCancel}
          />
        )}
        {props.editing && named && editor === null ? (
          <Row gap="16" testID="explore-saved-list-actions">
            <TextLink
              label={t({ id: 'explore.saved.renameList', message: 'Rename list' })}
              onPress={props.onRenameList}
              testID="explore-saved-rename-list"
            />
            <TextLink
              label={t({ id: 'explore.saved.deleteList', message: 'Delete list' })}
              onPress={props.onDeleteList}
              testID="explore-saved-delete-list"
            />
          </Row>
        ) : null}
        {empty ? (
          <EmptyState
            guide="tokek"
            guideName={guest.name}
            title={
              props.total === 0
                ? t({ id: 'explore.saved.emptyTitle', message: 'Nothing saved yet' })
                : t({ id: 'explore.saved.emptyList', message: 'Nothing in this list yet' })
            }
            line={t({
              id: 'explore.saved.emptyLine',
              message: 'Tap the heart on a place or a destination and it lands here.',
            })}
            {...(props.onExplore === undefined
              ? {}
              : {
                  action: {
                    label: t({ id: 'explore.saved.explore', message: 'Explore' }),
                    onPress: props.onExplore,
                  },
                })}
            sticker={<Sticker kind={guest.kind} name={guest.name} size={EMPTY_STICKER} />}
            testID="explore-saved-empty"
          />
        ) : null}
        {groups.groups.map((group) => (
          <View key={group.destinationId} style={styles.group} testID="explore-saved-group">
            <Text variant="eyebrow">{upper(group.destinationName, locale)}</Text>
            {group.destination === null ? null : (
              <>
                <ListCard
                  title={group.destinationName}
                  subtitle={t({ id: 'explore.saved.destination', message: 'Destination guide' })}
                  chevron
                  onPress={() => group.destination && props.onOpen(group.destination)}
                  testID={`explore-saved-item-${group.destination.refId}`}
                />
                {rowActions(group.destination)}
                {group.destinationSlug === null
                  ? null
                  : props.renderPack({
                      id: group.destinationId,
                      slug: group.destinationSlug,
                      name: group.destinationName,
                    })}
              </>
            )}
            {group.places.map((row) => (
              <View key={row.id}>
                <ListCard
                  title={row.subject?.name ?? ''}
                  subtitle={categoryLabel(row.subject?.category ?? '')}
                  chevron
                  onPress={() => props.onOpen(row)}
                  testID={`explore-saved-item-${row.refId}`}
                />
                {rowActions(row)}
              </View>
            ))}
          </View>
        ))}
        {groups.unknown === 0 ? null : (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            testID="explore-saved-unknown"
          >
            {t({
              id: 'explore.saved.unknown',
              message: plural(groups.unknown, {
                one: '# more saved place shows once its destination has been opened on this phone.',
                other:
                  '# more saved places show once their destinations have been opened on this phone.',
              }),
            })}
          </Text>
        )}
        {props.plans}
      </ScrollView>
    </Scaffold>
  );
}
