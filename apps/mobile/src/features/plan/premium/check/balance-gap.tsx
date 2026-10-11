/**
 * Balancing the crew (4.47, organisers only: whose saves made it, each as coloured squares, and the
 * one member to make room for, with Add both or Ask first) and filling a gap (4.44, the sheet over
 * the map: who is free when, the guide's three ideas to pick from, Add and Something else). Both
 * draw the shared screens' props.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewColour } from '@/features/vote';
import {
  Button,
  CrewStack,
  ListCard,
  LoadingCritter,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { BalanceViewProps } from '../../check/balance/balance-view';
import type { GapViewProps } from '../../check/fill-gap/gap-view';

const SQUARES = 8;

export function PremiumBalanceView(props: BalanceViewProps) {
  const theme = usePremiumTheme();
  const offer = props.offer;
  return (
    <PushScreen
      title={props.title}
      subtitle={props.onlyYou}
      backLabel={props.backLabel}
      scroll={false}
      testID="plan-balance"
    >
      <ScrollView contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
        <Text variant="body" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
          {props.summary}
        </Text>
        {props.loading ? <LoadingCritter label={props.title} /> : null}
        <ListCard>
          {props.rows.map((row) => (
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
              <CrewStack
                members={[{ id: row.key, name: row.name, color: crewColour(row.joinIndex) }]}
                size={32}
                accessibilityLabel={row.name}
              />
              <View style={{ flex: 1 }}>
                <Text variant="rowTextStrong">{row.name}</Text>
                {row.mustDo === null ? null : (
                  <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                    {row.mustDo}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {Array.from({ length: Math.min(SQUARES, row.saved) }, (_, at) => (
                    <View
                      key={at}
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor:
                          at < row.placed ? crewColour(row.joinIndex) : theme.color.controlDisabled,
                      }}
                    />
                  ))}
                </View>
                <Text variant="badge" tone="muted">
                  {row.count}
                </Text>
              </View>
            </View>
          ))}
        </ListCard>
        {offer === null ? null : (
          <View
            style={{
              borderRadius: theme.radius.card,
              backgroundColor: theme.color.banner.error.bg,
              padding: theme.space.rowPadH,
              gap: theme.space.gap8,
            }}
            testID="plan-balance-offer"
          >
            <Text variant="caption" color={theme.color.destructive.text}>
              {offer.line}
            </Text>
            {offer.places.map((place) => (
              <Text key={place.key} variant="note" color={theme.color.banner.error.text}>
                {`${place.name} · ${place.when}`}
              </Text>
            ))}
            {offer.status === null ? null : (
              <Text variant="captionMuted" tone="muted">
                {offer.status}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>
              {offer.add === null ? null : (
                <Button
                  size="small"
                  label={offer.add.label}
                  onPress={offer.add.onPress}
                  loading={offer.add.busy}
                  testID="plan-balance-add"
                />
              )}
              {offer.ask.onPress === null ? null : (
                <Button
                  size="small"
                  variant="control"
                  label={offer.ask.label}
                  onPress={offer.ask.onPress}
                  loading={offer.ask.busy}
                  testID="plan-balance-ask"
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </PushScreen>
  );
}

export function PremiumGapView(props: GapViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  return (
    <View style={{ flex: 1 }} testID="plan-gap">
      <ScrollView contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
        <Text variant="badge" color={theme.color.status.rain.text}>
          {props.window.toLocaleUpperCase()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
          <Text variant="title" style={{ flex: 1 }}>
            {props.title}
          </Text>
          <CrewStack
            members={props.free.map((member) => ({
              id: member.key,
              name: member.name,
              color: crewColour(member.joinIndex),
            }))}
            size={24}
            accessibilityLabel={props.free.map((member) => member.name).join(', ')}
          />
        </View>
        <Text variant="caption" tone="muted">
          {props.context}
        </Text>
        <Text variant="label" tone="muted">
          {props.eyebrow}
        </Text>
        {props.state === 'loading' ? <LoadingCritter label={props.eyebrow} /> : null}
        {props.state === 'none' ? (
          <Text variant="body" tone="muted">
            {props.empty}
          </Text>
        ) : null}
        {props.ideas.map((idea) => {
          const on = idea.key === props.picked;
          return (
            <PressableScale
              key={idea.key}
              onPress={() => props.onPick(idea.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              testID={`plan-gap-idea-${idea.key}`}
              style={{
                borderRadius: theme.radius.banner,
                backgroundColor: theme.color.card,
                borderWidth: on ? 2.5 : 0.5,
                borderColor: on ? theme.color.ink : theme.color.hairline,
                padding: theme.space.gap12,
                gap: theme.space.gap4,
              }}
            >
              <Text variant="rowTitle">{idea.title}</Text>
              <Text variant="caption" tone="muted">
                {idea.body}
              </Text>
              {idea.tags.length === 0 ? null : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                  {idea.tags.map((tag) => (
                    <View
                      key={tag.label}
                      style={{
                        height: 22,
                        borderRadius: 11,
                        paddingHorizontal: theme.space.gap8,
                        justifyContent: 'center',
                        backgroundColor: tag.color ?? theme.color.control,
                      }}
                    >
                      <Text variant="badge">{tag.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </PressableScale>
          );
        })}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: theme.space.gap16,
          paddingBottom: Math.max(insets.bottom, theme.space.gap12),
          gap: theme.space.gap4,
          alignItems: 'center',
        }}
      >
        <View style={{ alignSelf: 'stretch' }}>
          <Button
            label={props.add.label}
            onPress={props.add.onPress}
            loading={props.add.busy}
            disabled={props.picked === null}
            testID="plan-gap-add"
          />
        </View>
        <TextButton label={props.elseLabel} onPress={props.onElse} testID="plan-gap-else" />
        {props.onDismiss === undefined ? null : (
          <TextButton
            label={t({ id: 'plan.premium.gap.close', message: 'Close' })}
            onPress={props.onDismiss}
          />
        )}
      </View>
    </View>
  );
}
