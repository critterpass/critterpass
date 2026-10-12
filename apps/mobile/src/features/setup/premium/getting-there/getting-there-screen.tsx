/**
 * Getting there (4.18): "Day 1 starts at 16:30" (when the last of the crew has arrived), then each
 * member's way with where they leave from and what it costs one person (their booking replaces the
 * estimate). Your own row opens the way picker (flight, train, bus, car, boat, other, and where
 * from); everyone else's rows only read. The footer goes on to the next open row of your part.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lastArrival, WAY_THERE_MODES, type WayThereMode } from '@cp/domain';
import { format } from '@cp/i18n';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Avatar,
  Button,
  Card,
  GuideNote,
  ListCard,
  LoadingCritter,
  PressableScale,
  Text,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { money } from '@/features/vote';
import { setGettingThereCommand } from '../../data/commands';
import type { WayThere } from '../../data/checklist';
import { useMe } from '../../data/use-me';
import { useSetupChecklist } from '../../data/use-setup-checklist';
import { useSetupTrip } from '../../data/setup-trip';
import { crewFaces } from '../checklist/checklist-parts';

function modeWord(mode: string): string {
  switch (mode) {
    case 'flight':
      return t({ id: 'setup.way.flight', message: 'Flight' });
    case 'train':
      return t({ id: 'setup.way.train', message: 'Train' });
    case 'bus':
      return t({ id: 'setup.way.bus', message: 'Bus' });
    case 'car':
      return t({ id: 'setup.way.car', message: 'Car' });
    case 'boat':
      return t({ id: 'setup.way.boat', message: 'Boat' });
    default:
      return t({ id: 'setup.way.other', message: 'Another way' });
  }
}

function clock(locale: string, iso: string): string {
  return format.time(locale, new Date(iso));
}

export function GettingThereScreen({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  const me = useMe();
  const trip = useSetupTrip(tripId, me);
  const checklist = useSetupChecklist(trip);
  const locale = useLocale();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const save = useCommand(setGettingThereCommand);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<WayThereMode | null>(null);
  const [from, setFrom] = useState('');
  const backLabel = t({ id: 'setup.premium.back', message: 'Back' });
  const title = t({ id: 'setup.premium.row.gettingThere', message: 'Getting there' });

  if (trip == null || checklist === undefined) {
    return (
      <PushScreen title={title} backLabel={backLabel} testID="setup-getting-there-loading">
        <View style={{ paddingTop: theme.space.gap16 * 8 }}>
          <LoadingCritter label={t({ id: 'setup.loading', message: 'Loading trip setup' })} />
        </View>
      </PushScreen>
    );
  }
  const guide = guideSticker(trip.guide);
  const wayOf = (uid: string): WayThere | null => checklist.progress.get(uid)?.way ?? null;
  const last = lastArrival(
    trip.members.map((member) => ({
      uid: member.uid,
      arrivesAt: wayOf(member.uid)?.arrivesAt ?? null,
    })),
  );
  const startsAt = last?.arrivesAt == null ? null : clock(locale, last.arrivesAt);
  const mine = wayOf(trip.me);
  const chosen = mode ?? (mine?.mode as WayThereMode | undefined) ?? null;
  const submit = () => {
    if (chosen === null) return;
    const where = from.trim() === '' ? (mine?.from ?? '') : from.trim();
    void save.send({
      trip_id: tripId,
      mode: chosen,
      ...(where === '' ? {} : { from: where }),
    });
    setEditing(false);
  };

  return (
    <PushScreen
      title={t({ id: 'setup.premium.title', message: `${trip.destinationName} setup` })}
      subtitle={title}
      backLabel={backLabel}
      testID="setup-getting-there"
    >
      <View
        style={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap16,
        }}
      >
        <View style={{ gap: theme.space.gap6, paddingHorizontal: theme.space.gap8 }}>
          <Text variant="display" accessibilityRole="header">
            {startsAt === null
              ? t({ id: 'setup.way.titleOpen', message: 'How is everyone getting there?' })
              : t({ id: 'setup.way.title', message: `Day 1 starts at ${startsAt}` })}
          </Text>
          <Text variant="body" tone="muted">
            {t({
              id: 'setup.way.line',
              message: 'Everyone picks their own way. A booking replaces the estimate.',
            })}
          </Text>
        </View>
        <ListCard>
          {trip.members.map((member) => {
            const way = wayOf(member.uid);
            const you = member.uid === trip.me;
            const face = crewFaces(trip.members, [member.uid])[0];
            const name = you ? t({ id: 'setup.way.you', message: 'You' }) : member.name;
            const where = way?.from ?? null;
            const price =
              way === null
                ? null
                : way.bookingId !== null
                  ? t({ id: 'setup.way.booked', message: 'Booked' })
                  : way.estimateMinor !== null && way.currency !== null
                    ? t({
                        id: 'setup.way.about',
                        message: `about ${money(locale, way.estimateMinor, way.currency)}`,
                      })
                    : null;
            const line =
              way === null
                ? t({ id: 'setup.way.notYet', message: 'Not picked yet' })
                : way.arrivesAt === null
                  ? modeWord(way.mode)
                  : t({
                      id: 'setup.way.arrives',
                      message: `${modeWord(way.mode)} · lands ${clock(locale, way.arrivesAt)}`,
                    });
            return (
              <PressableScale
                key={member.uid}
                onPress={you ? () => setEditing((open) => !open) : undefined}
                disabled={!you}
                accessibilityRole={you ? 'button' : 'text'}
                accessibilityLabel={[name, where, line, price].filter(Boolean).join(', ')}
                testID={`setup-way-${you ? 'me' : member.uid}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  paddingVertical: theme.space.rowPadVLoose,
                  paddingHorizontal: theme.space.rowPadH,
                }}
              >
                {face === undefined ? null : (
                  <Avatar name={face.name} color={face.color} size={34} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="rowTextStrong" numberOfLines={1}>
                    {where === null ? name : `${name} · ${where}`}
                  </Text>
                  <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                    {line}
                  </Text>
                </View>
                {price === null ? null : (
                  <Text
                    variant="bannerAction"
                    color={
                      way?.bookingId != null
                        ? theme.color.status.booked.text
                        : theme.color.inkSecondary
                    }
                  >
                    {price}
                  </Text>
                )}
              </PressableScale>
            );
          })}
        </ListCard>
        {editing ? (
          <Card padded testID="setup-way-editor">
            <Text variant="label" tone="muted">
              {t({ id: 'setup.way.pick', message: 'How do you get there?' })}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: theme.space.gap8,
                marginTop: theme.space.gap10,
              }}
            >
              {WAY_THERE_MODES.map((option) => {
                const on = option === chosen;
                return (
                  <PressableScale
                    key={option}
                    onPress={() => setMode(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={modeWord(option)}
                    testID={`setup-way-mode-${option}`}
                    style={{
                      height: 36,
                      paddingHorizontal: theme.space.rowPadH,
                      borderRadius: 18,
                      justifyContent: 'center',
                      backgroundColor: on ? theme.color.ink : theme.color.control,
                    }}
                  >
                    <Text variant="pillSmall" tone={on ? 'onInk' : 'ink'}>
                      {modeWord(option)}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <View style={{ marginTop: theme.space.gap12 }}>
              <TextField
                accessibilityLabel={t({ id: 'setup.way.from', message: 'Where from' })}
                placeholder={
                  mine?.from ?? t({ id: 'setup.way.fromHint', message: 'Your airport or city' })
                }
                value={from}
                onChangeText={setFrom}
                returnKeyType="done"
                onSubmitEditing={submit}
                testID="setup-way-from"
              />
            </View>
            <View style={{ marginTop: theme.space.gap12 }}>
              <Button
                label={t({ id: 'setup.way.save', message: 'Save my way' })}
                onPress={submit}
                disabled={chosen === null}
                testID="setup-way-save"
              />
            </View>
          </Card>
        ) : null}
        <GuideNote
          name={guide.name}
          critter={guide.kind}
          text={t({
            id: 'setup.way.note',
            message: 'Day 1 waits for the last arrival, so nobody misses the first dinner.',
          })}
          testID="setup-way-note"
        />
        <Button
          label={t({ id: 'setup.way.done', message: 'Back to the checklist' })}
          variant="secondary"
          onPress={() => router.back()}
          testID="setup-way-done"
        />
      </View>
    </PushScreen>
  );
}
