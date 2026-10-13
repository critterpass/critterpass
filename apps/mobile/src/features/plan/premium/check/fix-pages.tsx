/**
 * Two of the guide's fixes: less driving (4.45: "3 h 50 → 2 h 40" in the car, the BEFORE / AFTER
 * routes, the new order with what moved and what's booked) and rain and crowds (4.46: the chart,
 * the swaps, each ticked to keep). Each has the privacy chip, its primary action and "Send to the crew first".
 * Reads and commands are the shared screens'.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Checkbox,
  ListCard,
  LoadingCritter,
  StatusTag,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { LessDrivingViewProps } from '../../check/less-driving/less-driving-props';
import type { RainViewProps } from '../../check/rain-crowds/rain-props';
import { RouteSketches, SwapChart } from './fix-sketches';

function FixPage(props: {
  readonly backLabel: string;
  readonly title: string;
  readonly testID: string;
  readonly children: ReactNode;
  readonly primary: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly send: (() => void) | null;
  readonly sendLabel: string;
}) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  return (
    <PushScreen
      title={props.title}
      subtitle={t({ id: 'planDraft.onlyYou', message: 'Only you see this' })}
      backLabel={props.backLabel}
      scroll={false}
      testID={props.testID}
    >
      <ScrollView contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
        {props.children}
      </ScrollView>
      {props.primary === null && props.send === null ? null : (
        <View
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: insets.bottom + theme.space.gap12,
            gap: theme.space.gap4,
            alignItems: 'center',
          }}
        >
          {props.primary === null ? null : (
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={props.primary.label}
                onPress={props.primary.onPress}
                loading={props.primary.busy}
                testID={`${props.testID}-primary`}
              />
            </View>
          )}
          {props.send === null ? null : (
            <TextButton
              label={props.sendLabel}
              onPress={props.send}
              testID={`${props.testID}-send`}
            />
          )}
        </View>
      )}
    </PushScreen>
  );
}

export function PremiumLessDrivingView(props: LessDrivingViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <FixPage
      backLabel={props.backLabel}
      title={t({ id: 'plan.premium.lessDriving.title', message: 'Less driving' })}
      testID="plan-less-driving"
      primary={props.primary}
      send={props.send}
      sendLabel={t({ id: 'plan.check.sendFirst', message: 'Send it to the crew first' })}
    >
      {props.state === 'loading' ? (
        <LoadingCritter
          label={t({
            id: 'plan.premium.lessDriving.loading',
            message: 'Looking for a shorter order',
          })}
        />
      ) : null}
      {props.state === 'none' ? (
        <View style={{ gap: theme.space.gap8 }}>
          <Text variant="body">
            {t({
              id: 'plan.premium.lessDriving.none',
              message: 'This order is already the shortest without moving anything booked.',
            })}
          </Text>
          {props.onOpenCheck === undefined ? null : (
            <TextButton
              label={t({ id: 'plan.check.lessDriving.openCheck', message: 'See the plan check' })}
              onPress={props.onOpenCheck}
            />
          )}
        </View>
      ) : null}
      {props.state !== 'ready' ? null : (
        <>
          <View style={{ paddingHorizontal: theme.space.gap8 }}>
            <Text variant="display">{`${props.before} → ${props.after}`}</Text>
            <Text variant="caption" tone="muted">
              {t({
                id: 'plan.premium.lessDriving.inCar',
                message: 'in the car, nothing booked moves',
              })}
            </Text>
          </View>
          <RouteSketches before={props.beforeStops} after={props.afterStops} stay={props.stay} />
          <ListCard>
            {props.rows.map((row, index) => (
              <View
                key={row.key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap10,
                  paddingVertical: theme.space.gap10,
                  paddingHorizontal: theme.space.rowPadH,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: theme.accent.pink,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="badge" color={theme.color.onAccent}>
                    {String(index + 1)}
                  </Text>
                </View>
                <Text variant="bannerAction" style={{ width: 42 }}>
                  {row.time}
                </Text>
                <Text variant="rowTextStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {row.name}
                </Text>
                {row.booked ? (
                  <StatusTag
                    tone="booked"
                    label={t({ id: 'plan.check.lessDriving.booked', message: 'Booked' })}
                  />
                ) : row.was === null ? null : (
                  <Text variant="captionMuted" tone="placeholder">
                    {row.was}
                  </Text>
                )}
              </View>
            ))}
          </ListCard>
          {props.estimate === true ? (
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'plan.premium.lessDriving.estimate',
                message:
                  'Some of these drives are estimates; they are checked again once the order is in.',
              })}
            </Text>
          ) : null}
        </>
      )}
    </FixPage>
  );
}

export function PremiumRainView(props: RainViewProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  return (
    <FixPage
      backLabel={props.backLabel}
      title={props.title}
      testID="plan-rain"
      primary={props.primary}
      send={props.send}
      sendLabel={t({ id: 'plan.check.rain.sendFirst', message: 'Send to the crew first' })}
    >
      {props.chip === null ? null : <StatusTag tone="rain" label={props.chip} />}
      <Text variant="caption" tone="muted">
        {props.source}
      </Text>
      {props.chart === null ? null : <SwapChart {...props.chart} />}
      {props.state === 'loading' ? <LoadingCritter label={props.title} /> : null}
      {props.state === 'none' ? (
        <Text variant="body">
          {t({
            id: 'plan.check.rain.noneBody',
            message: 'Nothing to swap. Every block is dry and quiet enough where it is.',
          })}
        </Text>
      ) : null}
      {props.rows.length === 0 ? null : (
        <ListCard>
          {props.rows.map((row) => (
            <View
              key={row.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingVertical: theme.space.gap12,
                paddingHorizontal: theme.space.rowPadH,
                opacity: row.ticked ? 1 : 0.5,
              }}
            >
              <Checkbox
                checked={row.ticked}
                onChange={() => props.onToggle(row.key)}
                accessibilityLabel={row.name}
                testID={`plan-rain-tick-${row.key}`}
              />
              <View style={{ flex: 1 }}>
                <Text variant="rowTextStrong">{`${row.name} ${row.from} → ${row.to}`}</Text>
                <Text variant="captionMuted" tone="muted">
                  {row.why}
                </Text>
              </View>
            </View>
          ))}
        </ListCard>
      )}
    </FixPage>
  );
}
