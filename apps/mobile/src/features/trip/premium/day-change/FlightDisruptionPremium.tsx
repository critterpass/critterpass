/**
 * A flight delay, cancellation or diversion (6.09), full screen with ✕: the flight and route as
 * the title, a white card with the "Delayed" stamp, how long, and the guide's line; then what is
 * already done (green checks), what is on its way, each question that needs a yes (Approve or
 * Keep 19:30, with who it is waiting on), what needs a look, and the links (rebook). Docked: "Tell
 * the crew" and "Undo everything" for an organiser or a delayed traveller.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  EmptyState,
  Icon,
  OfflinePill,
  PressableScale,
  RectStamp,
  Skeleton,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen, PageFooter } from '@/ui/premium/shell';

import { footerLabels, rowLine, sectionTitles, stateLines } from '../../disruptions/flight/copy';
import type { FlightViewProps } from '../../disruptions/flight/view-types';
import { useFlightDisruption } from '../../disruptions/flight/use-flight-disruption';
import { FlightRows, QuestionCard } from './FlightParts';

/** The flight page once its disruption is read (also what the screen tests render). */
export function FlightReady({ props }: { readonly props: FlightViewProps }) {
  const th = usePremiumTheme();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const model = props.model;
  if (model === null) return null;
  const titles = sectionTitles();
  const lines = stateLines();
  const footer = footerLabels();
  const footed = model.canAnnounce || model.canUndo;
  return (
    <View style={[styles.root, { backgroundColor: th.color.ground }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          // The footer stands under the list on the ground, so the last row only needs air.
          paddingBottom: footed ? th.space.gap16 : insets.bottom + th.space.gap16,
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap16,
        }}
      >
        <Text variant="navTitle" align="center">
          {props.eyebrow}
        </Text>
        <View
          style={[
            styles.card,
            styles.hero,
            {
              borderRadius: th.radius.cardLarge,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
          testID="disruption-hero"
        >
          <RectStamp word={props.heroLines[0]} ink="pink" />
          {props.heroLines[1] === null ? null : (
            <Text variant="hero" style={styles.tabular}>
              {props.heroLines[1]}
            </Text>
          )}
          {props.detail === '' ? null : (
            <Text variant="rowText" tone="muted">
              {props.detail}
            </Text>
          )}
        </View>
        {props.offline ? <OfflinePill label={lines.offline} /> : null}
        {model.status === 'open' ? null : (
          <Text variant="rowText" tone="muted" testID={`disruption-${model.status}`}>
            {model.status === 'undone' ? lines.undone : lines.resolved}
          </Text>
        )}
        <FlightRows title={titles.done} rows={model.done} tone="done" testID="disruption-done" />
        <FlightRows
          title={titles.working}
          rows={model.working}
          tone="working"
          testID="disruption-working"
        />
        {model.questions.map((question) => (
          <QuestionCard
            key={question.action.id}
            question={question}
            tz={props.tz}
            onAnswer={props.onAnswer}
          />
        ))}
        <FlightRows
          title={titles.problem}
          rows={model.problems}
          tone="problem"
          testID="disruption-problems"
        />
        {model.links.map((link) => (
          <PressableScale
            key={link.id}
            onPress={() => props.onOpenLink(link)}
            accessibilityRole="link"
            testID={`disruption-link-${link.id}`}
          >
            <View
              style={[
                styles.card,
                styles.row,
                {
                  borderRadius: th.radius.card,
                  backgroundColor: th.color.card,
                  boxShadow: th.shadow.card,
                },
              ]}
            >
              <Text variant="rowTitle" style={styles.flex}>
                {rowLine(link, locale)}
              </Text>
              <Icon name="forward" size={16} color={th.color.outlineEmpty} />
            </View>
          </PressableScale>
        ))}
      </ScrollView>
      {footed ? (
        <PageFooter>
          {model.canAnnounce ? (
            <Button
              label={footer.tell}
              loading={props.telling ?? false}
              onPress={props.onTellCrew}
              testID="disruption-tell-crew"
            />
          ) : null}
          {model.canUndo ? (
            <TextButton
              align="center"
              label={footer.undo}
              onPress={props.onUndoAll}
              testID="disruption-undo-all"
            />
          ) : null}
        </PageFooter>
      ) : null}
    </View>
  );
}

export function FlightDisruptionPremium({ id }: { readonly id: string }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const props = useFlightDisruption({ id });
  const lines = stateLines();
  return (
    <FullScreen
      closeLabel={t({ id: 'trip.disruptions.flight.premiumClose', message: 'Close' })}
      overPhoto={false}
      onClose={props.onBack}
      testID="disruption-screen"
    >
      {props.state === 'loading' ? (
        <View
          style={[
            styles.root,
            { backgroundColor: th.color.ground, padding: th.space.gutter, paddingTop: 120 },
          ]}
        >
          <Skeleton height={200} radius={th.radius.cardLarge} />
        </View>
      ) : props.state === 'missing' ? (
        <View style={[styles.root, { backgroundColor: th.color.ground, justifyContent: 'center' }]}>
          <EmptyState title={lines.missingTitle} line={lines.missing} />
        </View>
      ) : (
        <FlightReady props={props} />
      )}
    </FullScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { paddingHorizontal: 16 },
  hero: { paddingVertical: 18, gap: 8, alignItems: 'flex-start' },
  tabular: { fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  flex: { flex: 1, minWidth: 0 },
});
