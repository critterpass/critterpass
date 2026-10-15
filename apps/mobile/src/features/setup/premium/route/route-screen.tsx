/**
 * The route (4.19): the trip's stops in order, each with its nights (− / +) and how many of the
 * trip's nights are placed, a travel day between two stops, "Add a stop" (a city search), "Save
 * the route" (`set_trip_stops`: the budget and the draft follow) and "Just one stop" (back to the
 * trip's own place). Stops move up or down with their arrows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { STOPS_SQL, STOPS_TABLES, type StopRow } from '@/data/areas/area-queries';
import { useCommand } from '@/data/commands/use-command';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  Card,
  GuideNote,
  IconButton,
  ListCard,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { useDestinationSearch } from '@/features/vote';

import { dayColours } from '@/features/plan';

import { setTripStopsCommand } from '../../data/commands';
import { useLiveRows } from '../../data/rows';
import { useMe } from '../../data/use-me';
import { useSetupTrip } from '../../data/setup-trip';
import { StepHeadline, StepPage } from '../steps/step-parts';

const TRIP_SQL =
  'SELECT t.destination_id, d.name FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?';

interface Stop {
  readonly id: string;
  readonly name: string;
  readonly nights: number;
}

export function RouteScreen({ tripId }: { readonly tripId: string }) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const trip = useSetupTrip(tripId, useMe());
  const rows = useLiveRows<StopRow>(STOPS_SQL, [tripId], STOPS_TABLES);
  const home = useLiveRows<{ destination_id: string | null; name: string | null }>(
    TRIP_SQL,
    [tripId],
    ['trips', 'destinations'],
  );
  const save = useCommand(setTripStopsCommand);
  const [edited, setEdited] = useState<readonly Stop[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const search = useDestinationSearch(adding ? query : '');
  const totalNights = Math.max(1, (trip?.lengthDays ?? 2) - 1);
  const synced: readonly Stop[] =
    rows.rows.length > 0
      ? rows.rows.map((row) => ({
          id: row.destination_id,
          name: row.name ?? '',
          nights: row.nights,
        }))
      : home.rows[0]?.destination_id == null
        ? []
        : [{ id: home.rows[0].destination_id, name: home.rows[0].name ?? '', nights: totalNights }];
  const stops = edited ?? synced;
  const placed = stops.reduce((sum, stop) => sum + stop.nights, 0);
  const stopsLabel = t({
    id: 'setup.premium.route.stopCount',
    message: plural(stops.length, { one: '# stop', other: '# stops' }),
  });
  const nightsLabel = t({
    id: 'setup.premium.route.nightCount',
    message: plural(placed, { one: '# night', other: '# nights' }),
  });
  const guide = guideSticker(trip?.guide ?? null);
  const change = (next: readonly Stop[]) => {
    setProblem(null);
    setEdited(next);
  };
  const nights = (index: number, by: number) =>
    change(
      stops.map((stop, at) =>
        at === index ? { ...stop, nights: Math.max(1, stop.nights + by) } : stop,
      ),
    );
  const move = (index: number, by: number) => {
    const next = [...stops];
    const [taken] = next.splice(index, 1);
    if (taken === undefined) return;
    next.splice(Math.max(0, Math.min(next.length, index + by)), 0, taken);
    change(next);
  };
  const send = async (list: readonly Stop[]) => {
    const sent = await save.send({
      trip_id: tripId,
      stops: list.map((stop) => ({ destination_id: stop.id, nights: stop.nights })),
    });
    if (sent.kind === 'applied') router.back();
    else
      setProblem(
        t({
          id: 'setup.premium.route.failed',
          message: 'That didn’t save. Check the nights add up, then try again.',
        }),
      );
  };
  return (
    <StepPage
      title={t({ id: 'setup.premium.title', message: `${trip?.destinationName ?? ''} setup` })}
      subtitle={t({ id: 'setup.premium.row.route', message: 'The route' })}
      testID="setup-route"
      footer={
        <>
          {problem === null ? null : (
            <Text variant="caption" color={theme.color.destructive.helper}>
              {problem}
            </Text>
          )}
          <View style={{ alignSelf: 'stretch' }}>
            <Button
              label={t({ id: 'setup.premium.route.save', message: 'Save the route' })}
              onPress={() => void send(stops)}
              disabled={stops.length === 0}
              loading={save.pending}
              testID="route-save"
            />
          </View>
          {stops.length > 1 ? (
            <TextButton
              align="center"
              label={t({ id: 'setup.premium.route.oneStop', message: 'Just one stop' })}
              onPress={() => void send([])}
              testID="route-one-stop"
            />
          ) : null}
        </>
      }
    >
      <StepHeadline
        title={t({
          id: 'setup.premium.route.title',
          message: `${stopsLabel}, ${nightsLabel}`,
        })}
        line={t({
          id: 'setup.premium.route.line',
          message: plural(totalNights, {
            one: 'The trip has # night to place.',
            other: 'The trip has # nights to place.',
          }),
        })}
      />
      {stops.map((stop, index) => (
        <View key={`${stop.id}-${String(index)}`} style={{ gap: theme.space.gap8 }}>
          {index === 0 ? null : (
            <View
              style={{
                paddingLeft: 28,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
              }}
            >
              <View
                style={{
                  width: 2,
                  height: 40,
                  backgroundColor: theme.color.placeholder,
                  opacity: 0.6,
                }}
              />
              <Text variant="badge" tone="muted">
                {t({ id: 'setup.premium.route.travel', message: 'Travel day' }).toLocaleUpperCase()}
              </Text>
            </View>
          )}
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.space.gap12,
              padding: theme.space.gap14,
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                borderWidth: 2,
                borderColor: theme.accent.stickerEdge,
                backgroundColor: dayColours(index + 1).fill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="rowTextStrong" color={theme.color.onAccent}>
                {String(index + 1)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="headline">{stop.name}</Text>
              <Text variant="captionMuted" tone="muted">
                {t({
                  id: 'setup.premium.route.nights',
                  message: plural(stop.nights, { one: '# night', other: '# nights' }),
                })}
              </Text>
            </View>
            <IconButton
              icon="minus"
              size={32}
              tone="control"
              label={t({ id: 'setup.premium.route.lessNights', message: 'One night less' })}
              onPress={() => nights(index, -1)}
            />
            <IconButton
              icon="plus"
              size={32}
              tone="control"
              label={t({ id: 'setup.premium.route.moreNights', message: 'One night more' })}
              onPress={() => nights(index, 1)}
            />
            {stops.length > 1 ? (
              <IconButton
                icon="back"
                size={32}
                tone="white"
                label={t({ id: 'setup.premium.route.earlier', message: 'Earlier' })}
                onPress={() => move(index, -1)}
                disabled={index === 0}
              />
            ) : null}
          </Card>
        </View>
      ))}
      {adding ? (
        <Card padded>
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={t({ id: 'vote.search.label', message: 'A city or a country' })}
            placeholderTextColor={theme.color.placeholder}
            selectionColor={theme.color.caret}
            returnKeyType="search"
            testID="route-search"
            style={[theme.type.field, { color: theme.color.ink, height: 44 }]}
          />
          <ListCard>
            {search.results.slice(0, 5).map((result) => (
              <PressableScale
                key={result.place_id}
                onPress={() => {
                  change([...stops, { id: result.place_id, name: result.name, nights: 1 }]);
                  setAdding(false);
                  setQuery('');
                }}
                accessibilityRole="button"
                testID={`route-result-${result.place_id}`}
                style={{ padding: theme.space.rowPadH }}
              >
                <Text variant="rowTitle">{result.name}</Text>
              </PressableScale>
            ))}
          </ListCard>
        </Card>
      ) : (
        <PressableScale
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          testID="route-add"
          style={{
            height: 52,
            borderRadius: theme.radius.banner,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: theme.color.outlineEmpty,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="rowTitle" tone="inkSecondary">
            {t({ id: 'setup.premium.route.add', message: 'Add a stop' })}
          </Text>
        </PressableScale>
      )}
      <GuideNote
        name={guide.name}
        critter={guide.kind}
        text={t({
          id: 'setup.premium.route.note',
          message: 'Between two stops goes a travel day. I fit the days in each stop around it.',
        })}
      />
    </StepPage>
  );
}
