/**
 * Pick {name}: which legs?, the sheet over Compare (6.23): Cancel left, the bold verb right (Set, or
 * Ask the crew when the pick goes to a vote). Each plan day is a row with its window and hours and a
 * checkbox; a day another driver has reads Taken and is locked. The WhatsApp and "Ask the crew
 * first" toggles sit in a second card, his quote under them, and the overtime warning and what went
 * wrong with the last try under that. Swiping down with days changed asks first.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Card,
  Checkbox,
  ListCard,
  Row,
  StatusTag,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import type { PickDaysProps } from '../pick/use-pick-days';
import { usePickDaysView } from '../pick/use-pick-days-view';

export function PickDaysPremium(props: PickDaysProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const view = usePickDaysView(props);
  const { name, chosen, onSet, onAsk } = view;
  const [askFirst, setAskFirst] = useState(false);
  const [touched, setTouched] = useState(false);
  // His quote always goes to the crew, so the toggle is on and held there.
  const asking = onAsk !== null && (askFirst || onSet === null);
  const submit = asking ? onAsk : onSet;
  const tellLabel = t({ id: 'drivers.pick.tell', message: `Tell ${name} on WhatsApp` });
  const askLabel = t({ id: 'drivers.pick.ask', message: 'Ask the crew first' });
  const toggle = (date: string) => {
    setTouched(true);
    view.onToggle(date);
  };
  return (
    <SheetScreen
      title={t({ id: 'drivers.pick.title', message: 'Which legs?' })}
      cancelLabel={t({ id: 'drivers.premium.cancel', message: 'Cancel' })}
      {...(submit === null
        ? {}
        : {
            verb: {
              label: asking
                ? t({ id: 'drivers.premium.askVerb', message: 'Ask' })
                : t({ id: 'drivers.premium.setVerb', message: 'Set' }),
              // The pick closes the sheet itself once it is in; a refusal keeps it open.
              onPress: async () => {
                await submit();
                return false;
              },
              disabled: chosen === 0 || view.busy !== null,
              testID: 'drivers-pick-set',
            },
          })}
      dirty={touched}
      discardPrompt={{
        title: t({
          id: 'drivers.premium.pickDiscardTitle',
          message: `Leave without picking ${name}?`,
        }),
        message: t({
          id: 'drivers.premium.pickDiscardLine',
          message: 'The days you ticked are not kept.',
        }),
        discard: t({ id: 'drivers.premium.discard', message: 'Discard' }),
        keep: t({ id: 'drivers.premium.keep', message: 'Keep picking' }),
      }}
      testID="drivers-pick"
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap12 }]}>
        <Text variant="rowText" tone="muted">
          {t({
            id: 'drivers.premium.pickIntro',
            message: plural(chosen, {
              one: `Pick ${name} · # day ticked`,
              other: `Pick ${name} · # days ticked`,
            }),
          })}
        </Text>
        <ListCard>
          {view.days.map((day) =>
            day.taken ? (
              <View key={day.date} style={{ opacity: th.opacity.disabled }}>
                <Row
                  title={day.title}
                  subtitle={day.line}
                  trailing={
                    <StatusTag
                      label={t({ id: 'drivers.pick.taken', message: 'Taken' })}
                      tone="unopened"
                    />
                  }
                  testID={`drivers-pick-day-${day.date}`}
                />
              </View>
            ) : (
              <Row
                key={day.date}
                title={day.title}
                {...(day.line === '' ? {} : { subtitle: day.line })}
                trailing={
                  <Checkbox
                    checked={day.on}
                    onChange={() => toggle(day.date)}
                    accessibilityLabel={day.title}
                  />
                }
                onPress={() => toggle(day.date)}
                testID={`drivers-pick-day-${day.date}`}
              />
            ),
          )}
        </ListCard>
        <ListCard>
          <Row
            title={tellLabel}
            subtitle={t({
              id: 'drivers.pick.tellBody',
              message: 'I’ll write it with dates and pickup pins. You send it.',
            })}
            trailing={
              <Toggle
                value={view.tell.value}
                onChange={view.tell.onChange}
                disabled={view.tell.disabled}
                accessibilityLabel={tellLabel}
                testID="drivers-pick-tell"
              />
            }
          />
          {onAsk === null ? null : (
            <Row
              title={askLabel}
              subtitle={t({
                id: 'drivers.pick.askBody',
                message: 'Turns this into a vote, like any change',
              })}
              trailing={
                <Toggle
                  value={asking}
                  onChange={setAskFirst}
                  disabled={onSet === null}
                  accessibilityLabel={askLabel}
                  testID="drivers-pick-ask"
                />
              }
            />
          )}
        </ListCard>
        {view.quote ? (
          <Card padded testID="drivers-pick-quote">
            <Text variant="captionMuted" tone="muted">
              {t({ id: 'drivers.pick.quote', message: `${name}’s quote` })}
            </Text>
            <Text variant="rowText">{view.quote}</Text>
          </Card>
        ) : null}
        {view.overtime === null ? null : (
          <Text
            variant="caption"
            color={th.color.status.tangerine.text}
            align="center"
            testID="drivers-pick-overtime"
          >
            {view.overtime}
          </Text>
        )}
        {view.error === null ? null : (
          <Banner tone="error" text={view.error} testID="drivers-pick-error" />
        )}
      </View>
    </SheetScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 4, paddingBottom: 24 },
});
