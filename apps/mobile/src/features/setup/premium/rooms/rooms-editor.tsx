/**
 * Who sleeps where, edited (7.08): a full sheet with Cancel and Save. Each room is a card of seats;
 * long-press lifts a person and dropping them on a room lights it and moves them there, or tap a
 * person then a room. A full room refuses the move (warning haptic, a line saying why). Anyone
 * not placed yet waits in a dashed row above. The split under the rooms follows the layout as it
 * changes. Save sends the new layout and the crew is told; Cancel asks first if anything moved.
 */
import { useLingui } from '@lingui/react/macro';
import { useRef, useState, type ComponentRef } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTile } from '@/features/trip';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion';
import { PressableScale, ring, Text, usePremiumTheme } from '@/ui/premium';
import { askToDiscard, SheetHeader } from '@/ui/premium/shell';

import { money } from '../../budget/model';
import type { SetupMember } from '../../data/setup-trip';
import { moveGuest, unplaced, type PlanStay } from '../../rooms/model';
import { RoomSeat } from './room-seat';
import { bedTint } from './room-tint';
import { SplitCard } from './split-card';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function RoomsEditor(props: {
  readonly tripId: string;
  readonly stay: PlanStay;
  readonly currency: string;
  readonly people: ReadonlyMap<string, SetupMember>;
  readonly memberIds: readonly string[];
  readonly onSave: (stay: PlanStay, moved: { uid: string; roomKey: string }) => void;
  readonly onClose: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<PlanStay>(props.stay);
  const [lastMove, setLastMove] = useState<{ uid: string; roomKey: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const rects = useRef(new Map<string, Rect>());
  const views = useRef(new Map<string, ComponentRef<typeof View> | null>());
  const tryMove = (uid: string, roomKey: string) => {
    const result = moveGuest(draft, uid, roomKey);
    if (result.kind === 'full') {
      impact('warning');
      setFull(roomKey);
      return;
    }
    setFull(null);
    if (result.kind === 'moved') {
      impact('snap');
      setDraft(result.stay);
      setLastMove({ uid, roomKey });
    }
  };
  const measureAll = () => {
    for (const [key, view] of views.current) {
      view?.measureInWindow((x, y, width, height) =>
        rects.current.set(key, { x, y, width, height }),
      );
    }
  };
  const drop = (uid: string, x: number, y: number) => {
    for (const [roomKey, rect] of rects.current) {
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
        tryMove(uid, roomKey);
        return;
      }
    }
  };
  const pick = (uid: string) => setPicked((current) => (current === uid ? null : uid));
  const seat = (uid: string) => (
    <RoomSeat
      key={uid}
      uid={uid}
      name={props.people.get(uid)?.name ?? ''}
      joinIndex={props.people.get(uid)?.joinIndex ?? 0}
      picked={picked === uid}
      draggable
      onPick={pick}
      onLift={() => {
        measureAll();
        impact('peel');
      }}
      onDrop={drop}
    />
  );
  const cancel = () => {
    if (lastMove === null) {
      props.onClose();
      return;
    }
    void askToDiscard({
      title: t({ id: 'setup.premium.rooms.discardTitle', message: 'Discard these moves?' }),
      message: t({
        id: 'setup.premium.rooms.discardLine',
        message: 'The rooms stay as they were.',
      }),
      discard: t({ id: 'setup.premium.rooms.discard', message: 'Discard' }),
      keep: t({ id: 'setup.premium.rooms.keep', message: 'Keep editing' }),
    }).then((yes) => {
      if (yes) props.onClose();
    });
  };
  const waiting = unplaced(draft, props.memberIds);
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={cancel}
      testID="setup-rooms-editor"
    >
      <View style={[styles.root, { backgroundColor: th.color.ground }]}>
        <SheetHeader
          leadingLabel={t({ id: 'setup.premium.rooms.cancel', message: 'Cancel' })}
          onLeading={cancel}
          leadingTestID="setup-rooms-editor-cancel"
          title={t({ id: 'setup.rooms.title', message: 'Who sleeps where?' })}
          verb={{
            label: t({ id: 'setup.premium.rooms.save', message: 'Save' }),
            onPress: () => {
              if (lastMove !== null) props.onSave(draft, lastMove);
              props.onClose();
            },
            testID: 'setup-rooms-editor-save',
          }}
        />
        <ScrollView
          onScroll={measureAll}
          scrollEventThrottle={64}
          contentContainerStyle={{
            paddingHorizontal: th.space.gutter,
            paddingBottom: insets.bottom + 24,
            gap: th.space.gap10,
          }}
        >
          {waiting.length === 0 ? null : (
            <View
              style={[
                styles.waiting,
                { borderRadius: th.radius.card, borderColor: th.color.outlineEmpty },
              ]}
              testID="setup-rooms-unplaced"
            >
              <Text variant="rowTitle">
                {t({
                  id: 'setup.rooms.unplaced.organiser',
                  message: 'Joined after the rooms were made. Drop them into a room.',
                })}
              </Text>
              <View style={styles.seats}>{waiting.map(seat)}</View>
            </View>
          )}
          {full === null ? null : (
            <Text variant="caption" color={th.color.destructive.text} testID="setup-rooms-full">
              {t({
                id: 'setup.rooms.full',
                message: `That room is full. Move someone out of it first.`,
              })}
            </Text>
          )}
          {draft.rooms.map((room, at) => {
            const tint = bedTint(th, at);
            const target = picked !== null && !room.occupants.includes(picked);
            return (
              <PressableScale
                key={room.key}
                onPress={() => {
                  if (picked === null) return;
                  tryMove(picked, room.key);
                  setPicked(null);
                }}
                pressedScale={0.99}
                disabled={!target}
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'setup.premium.rooms.roomN',
                  message: `Room ${at + 1}`,
                })}
                testID={`setup-rooms-room-${room.key}`}
              >
                <View
                  ref={(view) => {
                    views.current.set(room.key, view);
                  }}
                  onLayout={measureAll}
                  style={[
                    styles.room,
                    {
                      borderRadius: th.radius.cardRow,
                      backgroundColor: th.color.card,
                      boxShadow: target ? ring(2, th.accent.sky) : th.shadow.card,
                    },
                  ]}
                >
                  <View style={styles.roomHead}>
                    <IconTile name="bed" bg={tint.bg} color={tint.text} size={40} />
                    <View style={styles.flex}>
                      <Text variant="rowTitle">
                        {t({ id: 'setup.premium.rooms.roomN', message: `Room ${at + 1}` })}
                      </Text>
                      <Text variant="captionMuted" tone="muted" style={styles.tabular}>
                        {t({
                          id: 'setup.premium.rooms.nightly',
                          message: `${money(locale, room.nightlyMinor, props.currency)} a night`,
                        })}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.seats}>
                    {room.occupants.map(seat)}
                    {Array.from(
                      { length: Math.max(0, room.capacity - room.occupants.length) },
                      (_, i) => (
                        <View key={i} style={styles.emptySeat}>
                          <View
                            style={[
                              styles.emptyFace,
                              { borderColor: target ? th.accent.sky : th.color.outlineEmpty },
                            ]}
                          />
                        </View>
                      ),
                    )}
                  </View>
                </View>
              </PressableScale>
            );
          })}
          <SplitCard tripId={props.tripId} stay={draft} planCurrency={props.currency} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  waiting: { borderWidth: 1.5, borderStyle: 'dashed', padding: 12, gap: 8 },
  room: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  roomHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emptySeat: { width: 52, alignItems: 'center' },
  emptyFace: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed' },
  tabular: { fontVariant: ['tabular-nums'] },
});
