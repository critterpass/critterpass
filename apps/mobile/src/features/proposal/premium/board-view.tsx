/**
 * Slide to board (4.52), full screen with its ✕: the trip and who is in so far, "Your seat's
 * saved, Rin", the boarding pass (it stays light in dark mode: from / to, passenger, dates, your
 * share, the group and seat), the line that it isn't a flight booking, and the slide track: drag
 * the thumb to the end to board (it springs back short of it). Once boarded the guide's egg is
 * set for landing and the way back to the proposal shows; maybe and "I can't make it" stay one tap
 * away. Reads and commands are the shared `BoardScreen`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { crewColour } from '@/features/vote';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  CrewStack,
  GlassIconButton,
  Icon,
  SPRINGS,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import type { BoardViewProps } from '../board/board-screen';

const TRACK = 68;
const THUMB = 56;

function SlideTrack(props: {
  readonly label: string;
  readonly onDone: () => void;
  readonly disabled: boolean;
}) {
  const theme = usePremiumTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const end = Math.max(0, width - THUMB - 12);
  const pan = Gesture.Pan()
    .enabled(!props.disabled)
    .onUpdate((event) => {
      'worklet';
      x.set(Math.max(0, Math.min(end, event.translationX)));
    })
    .onEnd(() => {
      'worklet';
      if (end > 0 && x.get() >= end * 0.92) {
        x.set(end);
        scheduleOnRN(props.onDone);
      } else {
        x.set(withSpring(0, SPRINGS.snappy));
      }
    });
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => props.onDone()}
      testID="board-slide"
      style={{
        height: TRACK,
        borderRadius: TRACK / 2,
        backgroundColor: theme.color.inkSurface,
        padding: 6,
        justifyContent: 'center',
      }}
    >
      <Text
        variant="button"
        tone="onInk"
        align="center"
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0.75 }}
      >
        {props.label}
      </Text>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: theme.accent.sun,
              alignItems: 'center',
              justifyContent: 'center',
            },
            thumb,
          ]}
        >
          <Icon name="forward" size={24} color={theme.color.onAccent} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function PremiumBoardView(props: BoardViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const info = guideSticker(props.guide);
  const { ticket } = props;
  const cell = (label: string, value: string) => (
    <View style={{ width: '50%', paddingVertical: 5 }}>
      <Text variant="captionMuted" tone="muted">
        {label}
      </Text>
      <Text variant="headline">{value}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.ground }} testID="proposal-board">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.space.gap6,
          paddingHorizontal: theme.space.gutter,
          gap: theme.space.gap16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
          <GlassIconButton
            icon="close"
            label={t({ id: 'proposal.premium.board.close', message: 'Close' })}
            onPress={props.onBack}
            testID="board-close"
          />
          <Text variant="label" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
            {props.eyebrow}
          </Text>
          <CrewStack
            members={props.crewIn.map((member) => ({
              id: member.key,
              name: member.name,
              color: crewColour(member.joinIndex),
            }))}
            size={22}
            accessibilityLabel={props.counter}
          />
          <Text variant="bannerAction">{props.counter}</Text>
        </View>
        <Text variant="display" accessibilityRole="header">
          {props.boarded
            ? t({ id: 'proposal.board.saved', message: `Your seat’s saved, ${props.name}` })
            : t({ id: 'proposal.board.waiting', message: `Your seat’s waiting, ${props.name}` })}
        </Text>
        <View
          testID="board-pass"
          style={{
            borderRadius: 28,
            backgroundColor: theme.accent.paper,
            boxShadow: theme.shadow.card,
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a tilt, never copy.
            transform: [{ rotate: '-1.5deg' }],
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: 110,
              margin: 8,
              borderRadius: 22,
              backgroundColor: theme.color.status.tangerine.bg,
              padding: theme.space.gap16,
              justifyContent: 'flex-end',
            }}
          >
            <Text variant="mono" color={theme.color.status.tangerine.text}>
              {t({ id: 'proposal.board.crewPass', message: 'Crew pass' }).toLocaleUpperCase()}
            </Text>
            <View style={{ position: 'absolute', right: 6, top: -10 }}>
              <CritterSticker kind={info.kind} name={info.name} size={110} />
            </View>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 18,
              paddingVertical: 14,
              gap: theme.space.gap12,
            }}
          >
            <Text variant="stat" color={theme.color.onAccent}>
              {ticket.from}
            </Text>
            <View
              style={{
                flex: 1,
                height: 0,
                borderTopWidth: 2,
                borderStyle: 'dashed',
                borderColor: theme.color.outlineEmpty,
              }}
            />
            <Text variant="stat" color={theme.color.onAccent}>
              {ticket.to}
            </Text>
          </View>
          <View
            style={{
              height: 0,
              borderTopWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: theme.color.fieldBorder,
              marginHorizontal: 18,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingHorizontal: 18,
              paddingVertical: 14,
            }}
          >
            {cell(t({ id: 'proposal.board.passenger', message: 'Passenger' }), ticket.passenger)}
            {cell(t({ id: 'proposal.board.dates', message: 'Dates' }), ticket.dates)}
            {ticket.share === null
              ? null
              : cell(t({ id: 'proposal.board.share', message: 'Your share' }), ticket.share)}
            {cell(
              t({ id: 'proposal.premium.board.seat', message: 'Seat' }),
              `${ticket.group} · ${ticket.seat}`,
            )}
          </View>
        </View>
        <Text variant="caption" tone="muted" testID="board-pass-note">
          {ticket.from === '—'
            ? t({
                id: 'proposal.board.notAFlight',
                message: 'This saves your seat on the trip. It is not a flight booking.',
              })
            : t({
                id: 'proposal.board.notAFlightFrom',
                message: `This saves your seat on the trip. It is not a flight booking: ${ticket.from} is your home airport.`,
              })}
        </Text>
        {props.boarded ? (
          <Text variant="bannerAction" testID="board-egg">
            {t({ id: 'proposal.board.egg', message: `${info.name}’s egg hatches when you land` })}
          </Text>
        ) : null}
        {props.pending ? (
          <Text variant="caption" tone="muted" testID="board-pending">
            {t({
              id: 'proposal.board.pending',
              message: 'Waiting for a connection to save your seat.',
            })}
          </Text>
        ) : null}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space.gutter,
          paddingBottom: insets.bottom + theme.space.gap12,
          gap: theme.space.gap6,
          alignItems: 'center',
        }}
      >
        {props.boarded ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={t({ id: 'proposal.board.done', message: 'Back to the proposal' })}
              onPress={props.onDone}
              testID="board-done"
            />
          </View>
        ) : (
          <>
            <View style={{ alignSelf: 'stretch' }}>
              <SlideTrack
                label={t({ id: 'proposal.board.slide', message: 'Slide to board' })}
                onDone={props.onBoard}
                disabled={props.pending}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: theme.space.gap16 }}>
              <TextButton
                label={t({ id: 'proposal.board.maybe', message: 'Maybe' })}
                onPress={props.onMaybe}
                testID="board-maybe"
              />
              <TextButton
                label={t({ id: 'proposal.board.out', message: 'I can’t make it' })}
                onPress={props.onOut}
                testID="board-out"
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}
