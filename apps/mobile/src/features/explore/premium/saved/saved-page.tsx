/**
 * Saved places in the premium look: a pushed page with Edit / Done, the list chips, the field that
 * names a list, then the saved destinations and places grouped by destination. In edit mode each
 * row offers Move (to another list) and Remove; a chosen list can be renamed or deleted. Drawn
 * from the saved page's own values (`SavedViewProps`).
 */

import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import {
  Button,
  CritterSticker,
  EmptyState,
  ListCard,
  Row,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { categoryLabel } from '../../category';
import type { SavedViewProps } from '../../components/saved-view';
import { guideFor } from '../../format';
import { ALL_LISTS, type SavedRow } from '../../saved-model';
import { placeIcon } from '../../search/place-icons';
import { SectionLabel } from '../components/labels';
import { PlaceThumb } from '../components/place-thumb';
import { ListChips, ListNameField, RowActions } from './saved-parts';

export function PremiumSavedView(props: SavedViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const defaultName = t({ id: 'explore.saved.defaultList', message: 'Saved' });
  const listLabel = (name: string | null) => name ?? defaultName;
  const { groups, editor, choice } = props;
  const named = choice !== null && choice !== ALL_LISTS;
  const loading = props.loading === true;
  const empty = !loading && groups.groups.length === 0 && groups.unknown === 0;
  const guest = guideFor(null);
  const actions = (row: SavedRow) =>
    !props.editing || row.pending ? null : (
      <RowActions
        row={row}
        moving={props.movingId === row.id}
        lists={props.lists}
        listLabel={listLabel}
        onMove={props.onMove}
        onMoveTo={props.onMoveTo}
        onRemove={props.onRemove}
      />
    );

  return (
    <PushScreen
      title={t({ id: 'explore.saved.title', message: 'Saved' })}
      backLabel={t({ id: 'explore.hero.back', message: 'Explore' })}
      {...(empty
        ? {}
        : {
            action: {
              key: 'edit',
              label: props.editing
                ? t({ id: 'explore.saved.done', message: 'Done' })
                : t({ id: 'explore.saved.edit', message: 'Edit' }),
              sfSymbol: props.editing ? 'checkmark' : 'pencil',
              glyph: props.editing ? 'check' : 'edit',
              text: true,
              onPress: props.onToggleEditing,
              testID: 'explore-saved-edit',
            },
          })}
      testID="explore-saved"
    >
      <View style={{ gap: theme.space.gap16, paddingTop: theme.space.gap8 }}>
        <ListChips
          lists={props.lists}
          total={props.total}
          choice={choice}
          listLabel={listLabel}
          onChoose={props.onChoose}
          onNewList={props.onNewList}
        />
        <View style={{ gap: theme.space.gap16, paddingHorizontal: theme.space.gutter }}>
          {editor === null ? null : (
            <ListNameField
              editor={editor}
              onChange={props.onEditorChange}
              onSubmit={props.onEditorSubmit}
              onCancel={props.onEditorCancel}
            />
          )}
          {named && editor === null ? (
            <View style={{ flexDirection: 'row', gap: theme.space.gap16 }}>
              <TextButton
                label={t({ id: 'explore.saved.renameList', message: 'Rename list' })}
                onPress={props.onRenameList}
                testID="explore-saved-rename"
              />
              <TextButton
                label={t({ id: 'explore.saved.deleteList', message: 'Delete list' })}
                onPress={props.onDeleteList}
                color={theme.color.destructive.text}
                testID="explore-saved-delete"
              />
            </View>
          ) : null}
          {loading ? (
            <View style={{ gap: theme.space.gap8 }} testID="explore-saved-loading">
              <Skeleton height={64} radius={theme.radius.cardRow} />
              <Skeleton height={64} radius={theme.radius.cardRow} />
            </View>
          ) : empty ? (
            <EmptyState
              title={
                named
                  ? t({ id: 'explore.saved.emptyList', message: 'Nothing in this list yet' })
                  : t({ id: 'explore.saved.emptyTitle', message: 'Nothing saved yet' })
              }
              line={t({
                id: 'explore.saved.emptyLine',
                message: 'Tap the heart on a place or a destination and it lands here.',
              })}
              critter={{ kind: guest.kind, name: guest.name }}
              {...(props.onExplore === undefined
                ? {}
                : {
                    action: (
                      <Button
                        label={t({ id: 'explore.saved.explore', message: 'Explore' })}
                        variant="secondary"
                        onPress={props.onExplore}
                      />
                    ),
                  })}
              testID="explore-saved-empty"
            />
          ) : (
            groups.groups.map((group) => (
              <View key={group.destinationId} style={{ gap: theme.space.gap8 }}>
                <SectionLabel>{group.destinationName}</SectionLabel>
                <ListCard>
                  {group.destination === null ? null : (
                    <View>
                      <Row
                        title={group.destinationName}
                        subtitle={t({
                          id: 'explore.saved.destination',
                          message: 'Destination guide',
                        })}
                        leading={
                          <CritterSticker
                            kind={guideFor(null).kind}
                            name={group.destinationName}
                            size={40}
                          />
                        }
                        onPress={() => {
                          if (group.destination !== null) props.onOpen(group.destination);
                        }}
                        testID={`explore-saved-destination-${group.destinationId}`}
                      />
                      {actions(group.destination)}
                    </View>
                  )}
                  {group.places.map((row) => (
                    <View key={row.id}>
                      <Row
                        title={row.subject?.name ?? ''}
                        {...(row.subject?.category == null
                          ? {}
                          : { subtitle: categoryLabel(row.subject.category) })}
                        leading={
                          <PlaceThumb icon={placeIcon(row.subject?.category ?? null)} size={40} />
                        }
                        onPress={() => props.onOpen(row)}
                        testID={`explore-saved-place-${row.refId}`}
                      />
                      {actions(row)}
                    </View>
                  ))}
                </ListCard>
              </View>
            ))
          )}
          {groups.unknown === 0 ? null : (
            <Text variant="captionMuted" tone="muted" testID="explore-saved-unknown">
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
        </View>
      </View>
    </PushScreen>
  );
}
