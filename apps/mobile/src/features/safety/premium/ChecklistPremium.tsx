/**
 * One Help problem's checklist (built from the 6.16 pieces): the problem as the large title, its
 * phrase in the ink "SHOW THIS" card with play, then each step as a numbered card with the one
 * thing it lets the traveller do (Go, Call, Show it, Share, the ride quote, the ops desk). Asking
 * the desk confirms first with the system alert; the phrase shows big at full brightness.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';

import { Button, Text, usePremiumTheme, type ButtonVariant } from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { stepText } from '../help/checklist-copy';
import { useChecklistScreen } from '../help/use-checklist-screen';
import type { StepAction } from '../help/use-step-actions';
import { HelpPhrase } from './HelpParts';
import { PhraseBig } from './PhraseBig';

/** The step's action as a premium button: the main one ink, the rest light. */
function variantFor(tone: StepAction['tone']): ButtonVariant {
  if (tone === 'primary' || tone === 'urgent') return 'primary';
  if (tone === 'success') return 'secondary';
  return 'control';
}

export function ChecklistPremium() {
  const th = usePremiumTheme();
  const { t, i18n } = useLingui();
  const list = useChecklistScreen({ onAskDesk: () => askDesk() });
  const { phrase, speech } = list;

  function askDesk() {
    void confirmAlert({
      title: t({ id: 'safety.desk.title', message: 'Ops desk calls the clinic with you' }),
      message: list.deskText,
      confirm: t({ id: 'safety.desk.confirm', message: 'Ask the desk' }),
      cancel: t({ id: 'safety.send.cancel', message: 'Cancel' }),
      destructive: false,
    }).then((yes) => {
      if (yes) list.sendDesk();
    });
  }

  return (
    <PushScreen
      title={list.title}
      backLabel={t({ id: 'safety.premium.back', message: 'Back' })}
      testID={`help-checklist-${list.problem}`}
    >
      <View style={[styles.body, { paddingHorizontal: th.space.gutter, gap: th.space.gap14 }]}>
        <Text variant="largeTitle" accessibilityRole="header">
          {list.title}
        </Text>
        {phrase === null ? null : (
          <HelpPhrase
            phrase={phrase}
            playing={speech.speaking}
            onPlay={speech.speak}
            onShow={() => list.setShowIt(true)}
          />
        )}
        <View style={{ gap: th.space.gap8 }}>
          {list.steps.map((step, index) => {
            const action = list.actionFor(step);
            return (
              <View
                key={step.id}
                testID={`checklist-step-${step.kind}`}
                style={[
                  styles.step,
                  {
                    borderRadius: th.radius.card,
                    backgroundColor: th.color.card,
                    boxShadow: th.shadow.card,
                    gap: th.space.gap12,
                  },
                ]}
              >
                <View style={[styles.number, { backgroundColor: th.color.control }]}>
                  <Text variant="label">{String(index + 1)}</Text>
                </View>
                <Text variant="rowText" style={styles.flex}>
                  {stepText(step, i18n)}
                </Text>
                {action === null ? null : (
                  <Button
                    label={action.label}
                    size="small"
                    variant={variantFor(action.tone)}
                    onPress={action.onPress}
                    testID={`checklist-action-${step.kind}`}
                  />
                )}
              </View>
            );
          })}
        </View>
      </View>
      {list.showIt && phrase !== null ? (
        <PhraseBig
          phrase={phrase.text}
          gloss={phrase.gloss}
          onClose={() => list.setShowIt(false)}
        />
      ) : null}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40 },
  step: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
});
