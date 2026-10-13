/**
 * Crew SOS (6.17), a takeover with no ✕: a pink band, the SOS chip with the time (the dot blinks
 * while nobody is coming) and how far away, the sender's avatar ringed in pink, "Jordan needs help",
 * their words as a bubble, what the guide is doing, who is going, then "I'm going" and "Call
 * Jordan" (the sender sees "I'm OK" and the local number), "See him on the map". Resolved, it says
 * they are safe and closes; an SOS that never reached anyone asks to send it again.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewAccent } from '@/features/trip';
import { distanceIn } from '@/lib/i18n/formats';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  Button,
  CritterSticker,
  Icon,
  ring,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { clockTime } from '../format';
import { useResponderLine, useSosStepText } from '../sos/sos-copy';
import type { SosViewProps } from '../sos/view-types';
import { useSosScreen } from '../sos/use-sos-screen';
import { SosActions } from './SosActions';

/** The SOS page once it is read (also what the screen tests render). */
export function SosReady({ props }: { readonly props: SosViewProps }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const stepText = useSosStepText(props.model);
  const responderLine = useResponderLine();
  const { model, hero, general } = props;
  const { guideName } = props.steps;
  const { seen } = model;
  const name = model.senderName;
  const time = clockTime(model.openedAt, locale);
  const away = hero.distanceM === null ? null : distanceIn(hero.distanceM);
  const km = away === null ? null : away.value.toFixed(1);
  const title =
    model.state === 'resolved'
      ? model.role === 'sender'
        ? t({ id: 'safety.sos.youSafeTitle', message: 'The crew knows you are OK' })
        : t({ id: 'safety.sos.safeTitle', message: `${name} is safe` })
      : model.role === 'sender'
        ? model.reachedNobody
          ? t({ id: 'safety.sos.youAlone', message: 'Nobody else got this' })
          : t({ id: 'safety.sos.youTitle', message: 'Your crew is on it' })
        : t({ id: 'safety.sos.title', message: `${name} needs help` });
  return (
    <ScrollView
      style={{ backgroundColor: th.color.ground }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <View
        style={[
          styles.band,
          {
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
            backgroundImage: `linear-gradient(180deg, ${th.color.status.voteOpen.bg}, ${th.color.ground})`,
            paddingTop: insets.top + 12,
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={[styles.sos, { backgroundColor: th.accent.pink }]}>
            <View
              style={[
                styles.sosDot,
                { backgroundColor: th.color.onAccent },
                model.waiting ? null : styles.still,
              ]}
            />
            <Text variant="badge" color={th.color.onAccent}>
              {model.role === 'sender'
                ? t({ id: 'safety.sos.sentAt', message: `SOS sent · ${time}` })
                : t({ id: 'safety.sos.at', message: `SOS · ${time}` })}
            </Text>
          </View>
          {km === null || model.role === 'sender' ? null : (
            <Text variant="caption" color={th.color.destructive.helper} testID="sos-distance">
              {away?.unit === 'mi'
                ? t({ id: 'safety.sos.awayMiles', message: `${km} mi from you` })
                : t({ id: 'safety.sos.away', message: `${km} km from you` })}
            </Text>
          )}
        </View>
        <View style={[styles.avatar, { boxShadow: ring(8, th.color.status.voteOpen.bg) }]}>
          <Avatar name={name} color={crewAccent(0)} uid={model.senderUid} size={68} ringed />
        </View>
        <Text variant="display" accessibilityRole="header" testID="sos-title">
          {title}
        </Text>
        {hero.words === '' ? null : (
          <View
            style={[styles.bubble, { backgroundColor: th.color.card, boxShadow: th.shadow.card }]}
          >
            <Text variant="body">{hero.words}</Text>
          </View>
        )}
      </View>
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        {model.state === 'stale' ? (
          <Text variant="headline" testID="sos-stale">
            {t({
              id: 'safety.sos.staleQuestion',
              message: "Your SOS didn't reach the crew in time. Are you still in trouble?",
            })}
          </Text>
        ) : (
          <View
            style={[
              styles.card,
              {
                borderRadius: th.radius.cardRow,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.card,
              },
            ]}
            testID="sos-steps"
          >
            <View style={styles.row}>
              <CritterSticker
                kind={props.steps.guideSticker.kind}
                name={props.steps.guideName}
                size={30}
              />
              <Text variant="label" tone="muted">
                {t({ id: 'safety.sos.onIt', message: `${guideName}'s on it` })}
              </Text>
            </View>
            {model.steps.map((step) => (
              <View key={step.key} style={styles.row}>
                <View
                  style={[
                    styles.tick,
                    step.done
                      ? { backgroundColor: th.color.status.booked.bg }
                      : { boxShadow: ring(2, th.color.outlineEmpty, true) },
                  ]}
                >
                  {step.done ? (
                    <Icon name="check" size={11} color={th.color.status.booked.text} />
                  ) : null}
                </View>
                <Text variant="rowText" tone={step.done ? 'ink' : 'muted'} style={styles.flex}>
                  {stepText(step)}
                </Text>
              </View>
            ))}
          </View>
        )}
        {model.role === 'sender' && model.escalated && !model.reachedNobody ? (
          <Text variant="headline" testID="sos-escalated">
            {t({ id: 'safety.sos.noAnswer', message: `No one's answered yet. Call ${general}?` })}
          </Text>
        ) : null}
        {model.role === 'sender' && model.state === 'open' && model.reachedNobody ? (
          <Text variant="headline" testID="sos-nobody">
            {t({
              id: 'safety.sos.nobody',
              message: `Nobody else is in your crew yet. Call ${general} now.`,
            })}
          </Text>
        ) : null}
        {model.role === 'sender' && model.state === 'open' && !model.reachedNobody ? (
          <Text variant="caption" tone="muted" testID="sos-seen">
            {t({ id: 'safety.sos.seen', message: `Crew alerted · ${seen} seen` })}
          </Text>
        ) : null}
        {model.responders.map((responder) => (
          <Text
            key={responder.uid}
            variant="rowTextStrong"
            testID={`sos-responder-${responder.uid}`}
          >
            {responderLine(responder)}
          </Text>
        ))}
        <SosActions props={props} />
        {model.role === 'crew' && model.state === 'open' && model.myResponse === 'coming' ? (
          <TextButton
            label={t({ id: 'safety.sos.theyAreSafe', message: `${name} is safe` })}
            onPress={props.onSafe}
            testID="sos-safe"
          />
        ) : null}
        {model.state === 'open' && model.role === 'crew' ? (
          <TextButton
            label={t({ id: 'safety.sos.seeOnMap', message: `See ${name} on the map` })}
            onPress={props.onMap}
            testID="sos-map-link"
          />
        ) : null}
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'safety.help.disclaimer',
            message: `CritterPass tells your crew. For emergencies call ${general}.`,
          })}
        </Text>
      </View>
    </ScrollView>
  );
}

export function SosPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const sos = useSosScreen();
  if (sos.kind === 'pending') {
    const { general } = sos;
    return (
      <FullScreen
        closeLabel={t({ id: 'safety.sos.close', message: 'Close' })}
        overPhoto={false}
        onClose={sos.onClose}
        testID="sos-pending"
      >
        <View
          style={[styles.pending, { backgroundColor: th.color.ground, padding: th.space.gutter }]}
        >
          <Text variant="display" align="center">
            {sos.sent
              ? t({ id: 'safety.premium.sosGoing', message: 'Your SOS is going out' })
              : t({ id: 'safety.premium.sosLoading', message: 'Opening the SOS' })}
          </Text>
          <Button
            label={t({ id: 'safety.sos.callGeneral', message: `Call ${general}` })}
            onPress={sos.onCallGeneral}
            testID="sos-pending-call"
          />
        </View>
      </FullScreen>
    );
  }
  return <SosReady props={sos.props} />;
}

const styles = StyleSheet.create({
  band: { paddingHorizontal: 24, paddingBottom: 20, gap: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sos: {
    height: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  sosDot: { width: 8, height: 8, borderRadius: 4 },
  still: { opacity: 1 },
  avatar: { alignSelf: 'flex-start', borderRadius: 34 },
  bubble: { marginRight: 36, borderRadius: 20, borderBottomLeftRadius: 6, padding: 14 },
  body: { paddingTop: 4 },
  card: { padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  pending: { flex: 1, justifyContent: 'center', gap: 20 },
});
