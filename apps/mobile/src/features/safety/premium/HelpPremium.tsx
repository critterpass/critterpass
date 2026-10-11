/**
 * Help (6.16): "Need a hand?" and where you are; the emergency number as the big pink tile with
 * the police (or tourist police) beside it; four doors for what went wrong; the nearest clinic with
 * Go; the phrase to show in ink with play; sharing with the crew for an hour (start, +1 h, stop);
 * SOS to the crew; the insurance line. The first open asks once, in place, whether opening Help
 * should share where you are. Calling says when the crew is seeing you.
 */
import type { HelpProblem } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, StyleSheet, View } from 'react-native';

import { IconTile, type LineIconName } from '@/features/trip';
import { Button, PressableScale, StatusTag, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { facilityDetail } from '../help/help-copy';
import { serviceLabel } from '../help/service-label';
import { useHelpScreen } from '../help/use-help-screen';
import { HelpConsent, HelpPhrase, HelpShare } from './HelpParts';
import { PhraseBig } from './PhraseBig';

const PROBLEM_ICON: Readonly<Record<HelpProblem, LineIconName>> = {
  hurt: 'shield',
  lost_stolen: 'wallet',
  lost: 'map',
  missed_ride: 'car',
};

export function HelpPremium() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const help = useHelpScreen();
  const { props } = help;
  const { model, share: shareProps } = props;
  const general = model.general.number;
  const share = shareProps.share;
  const problems: { id: HelpProblem; label: string }[] = [
    { id: 'hurt', label: t({ id: 'safety.help.hurt', message: 'Hurt or sick' }) },
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a problem id, never copy
    { id: 'lost_stolen', label: t({ id: 'safety.help.lostStolen', message: 'Lost or stolen' }) },
    { id: 'lost', label: t({ id: 'safety.help.imLost', message: "I'm lost" }) },
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a problem id, never copy
    { id: 'missed_ride', label: t({ id: 'safety.help.missedRide', message: 'Missed a ride' }) },
  ];
  const facility = model.facility;
  const chip =
    share === null
      ? null
      : t({
          id: 'safety.premium.crewSees',
          message: `Crew can see you · ${Math.max(1, Math.ceil(share.minutesLeft / 60))}h`,
        });
  return (
    <PushScreen
      title={t({ id: 'safety.premium.helpTitle', message: 'Help' })}
      backLabel={t({ id: 'safety.premium.back', message: 'Back' })}
      testID="help-screen"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: th.space.gutter, gap: th.space.gap14 },
        ]}
      >
        <View style={styles.head}>
          <View style={styles.flex}>
            <Text variant="largeTitle" accessibilityRole="header">
              {t({ id: 'safety.premium.needHand', message: 'Need a hand?' })}
            </Text>
            {model.placeLabel === null ? null : (
              <Text variant="rowText" tone="muted">
                {t({ id: 'safety.premium.youreOn', message: `You're on ${model.placeLabel}.` })}
              </Text>
            )}
          </View>
          {chip === null ? null : (
            <StatusTag label={chip} tone="booked" testID="help-sharing-chip" />
          )}
        </View>
        {help.asking ? <HelpConsent crewName={help.crewName} onAnswer={help.answer} /> : null}
        <View style={styles.tiles} testID="help-tiles">
          <PressableScale
            style={styles.big}
            onPress={() => props.onCall(general)}
            accessibilityRole="button"
            accessibilityLabel={`${general}`}
            testID="help-call-general"
          >
            <View
              style={[
                styles.tile,
                { backgroundColor: th.accent.pink, borderRadius: th.radius.cardRow },
              ]}
            >
              <Text variant="stat" color={th.color.onAccent}>
                {t({ id: 'safety.premium.call', message: `Call ${general}` })}
              </Text>
              <Text variant="label" color={th.color.onAccent}>
                {model.coverage === 'limited'
                  ? t({ id: 'safety.help.limitedLabel', message: 'Emergency, from any mobile' })
                  : serviceLabel(model.general.service, model.general.label)}
              </Text>
            </View>
          </PressableScale>
          {model.side === null ? null : (
            <PressableScale
              style={styles.small}
              onPress={() => props.onCall(model.side?.number ?? general)}
              accessibilityRole="button"
              testID="help-call-side"
            >
              <View
                style={[
                  styles.tile,
                  {
                    backgroundColor: th.color.card,
                    borderRadius: th.radius.cardRow,
                    boxShadow: th.shadow.card,
                  },
                ]}
              >
                <Text variant="title">{model.side.number}</Text>
                <Text variant="captionMuted" tone="muted" numberOfLines={2}>
                  {serviceLabel(model.side.service, model.side.label)}
                </Text>
              </View>
            </PressableScale>
          )}
        </View>
        <View style={styles.grid}>
          {problems.map((problem) => (
            <PressableScale
              key={problem.id}
              style={styles.half}
              onPress={() => props.onProblem(problem.id)}
              accessibilityRole="button"
              testID={`help-problem-${problem.id}`}
            >
              <View
                style={[
                  styles.helper,
                  {
                    borderRadius: th.radius.field,
                    backgroundColor: th.color.card,
                    boxShadow: th.shadow.card,
                  },
                ]}
              >
                <IconTile
                  name={PROBLEM_ICON[problem.id]}
                  bg={th.color.control}
                  color={th.color.ink}
                  size={32}
                />
                <Text variant="rowTextStrong" style={styles.flex} numberOfLines={2}>
                  {problem.label}
                </Text>
              </View>
            </PressableScale>
          ))}
        </View>
        {facility === null ? (
          model.coverage === 'full' ? (
            <Text variant="caption" tone="muted" testID="help-no-facility">
              {t({
                id: 'safety.help.noFacility',
                message: 'No clinic on file near here yet. The numbers above work everywhere.',
              })}
            </Text>
          ) : null
        ) : (
          <View
            style={[
              styles.clinic,
              {
                borderRadius: th.radius.card,
                backgroundColor: th.color.card,
                boxShadow: th.shadow.card,
              },
            ]}
          >
            <View style={styles.flex}>
              <Text variant="rowTitle">
                {facility.open24h
                  ? t({ id: 'safety.help.open24', message: `${facility.name} · Open 24h` })
                  : facility.name}
              </Text>
              <Text variant="captionMuted" tone="muted">
                {facilityDetail(facility, t)}
              </Text>
            </View>
            <Button
              label={t({ id: 'safety.help.go', message: 'Go' })}
              size="medium"
              onPress={() => props.onGo(facility)}
              testID="help-clinic-go"
            />
          </View>
        )}
        {model.coverage === 'limited' ? (
          <Text variant="caption" tone="muted" testID="help-limited">
            {t({
              id: 'safety.help.limited',
              message: `Limited coverage here: ${general} works from any mobile phone. Your embassy can help too.`,
            })}
          </Text>
        ) : null}
        {model.phrase === null ? null : (
          <HelpPhrase
            phrase={model.phrase}
            playing={props.playing}
            onPlay={props.onPlay}
            onShow={() => help.setShowIt(true)}
          />
        )}
        <HelpShare share={shareProps} />
        {props.onSos === null ? null : (
          <Button
            label={t({ id: 'safety.help.sos', message: 'SOS to the crew' })}
            variant="destructive"
            onPress={props.onSos}
            testID="help-sos"
          />
        )}
        {props.insurer === null ? (
          <TextButton
            label={t({ id: 'safety.help.noInsurance', message: 'No insurance on file · add' })}
            onPress={props.onInsurance}
            testID="help-insurance-add"
          />
        ) : (
          <PressableScale
            onPress={props.onInsurance}
            accessibilityRole="button"
            testID="help-insurance"
          >
            <Text variant="caption" tone="muted">
              {props.insurer}
            </Text>
          </PressableScale>
        )}
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'safety.help.disclaimer',
            message: `CritterPass tells your crew. For emergencies call ${general}.`,
          })}
        </Text>
        {props.onHelpCentre === undefined ? null : (
          <TextButton
            label={t({ id: 'safety.help.centre', message: 'Help with the app' })}
            onPress={props.onHelpCentre}
            testID="help-centre"
          />
        )}
      </ScrollView>
      {help.showIt && help.phrase !== null ? (
        <PhraseBig
          phrase={help.phrase.text}
          gloss={help.phrase.gloss}
          onClose={() => help.setShowIt(false)}
        />
      ) : null}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  tiles: { flexDirection: 'row', gap: 10 },
  big: { flex: 1.6 },
  small: { flex: 1 },
  tile: { minHeight: 92, padding: 14, justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { width: '48.8%' },
  helper: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  clinic: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
});
