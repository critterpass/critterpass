/**
 * One Help problem's checklist (designed in code from the Help hub's parts): the problem's phrase
 * card on top, then each curated step with the one thing it lets the traveller do (GO, CALL, SHOW
 * IT, SHARE, ride quote, the guide, the ops desk). Offline it is built from synced rows and worded
 * from the app's own templates; online the guide's wording replaces them when it answers in time.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/ui/cards/Card';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { ActionPill } from '@/ui/plan/ActionPill';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';
import { PhraseCard } from '@/ui/trip/PhraseCard';

import { safetyRoutes } from '../routes';
import { stepText } from './checklist-copy';
import { ShowIt } from './show-it';
import { useChecklistScreen } from './use-checklist-screen';
import type { StepAction } from './use-step-actions';

export function ChecklistScreen() {
  const { t, i18n } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const list = useChecklistScreen();
  const { problem, phrase, speech, steps, showIt, setShowIt, askDesk, setAskDesk, deskText } = list;
  return (
    <Scaffold variant="dark" testID={`help-checklist-${problem}`}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.size.gutter,
          paddingBottom: insets.bottom + theme.space['32'],
          gap: theme.space['16'],
        }}
      >
        <BackEyebrow
          label={t({ id: 'safety.back.help', message: 'Help' })}
          fallback={safetyRoutes.help(list.tripId ?? undefined)}
        />
        <Text variant="h1" accessibilityRole="header">
          {list.title}
        </Text>
        {phrase === null ? null : (
          <PhraseCard
            tone="paper"
            phrase={phrase.text}
            lang={phrase.language}
            translation={phrase.gloss}
            playing={speech.speaking}
            {...(speech.speak === null ? {} : { onPlay: speech.speak })}
            testID="checklist-phrase"
          />
        )}
        <Stack gap="10">
          {steps.map((step, index) => {
            const action: StepAction | null = list.actionFor(step);
            return (
              <Card key={step.id} tone="raised" testID={`checklist-step-${step.kind}`}>
                <Row gap="12" align="center">
                  <Text variant="title" color={theme.semantic.text.secondary}>
                    {index + 1}
                  </Text>
                  <Stack flex={1}>
                    <Text variant="body">{stepText(step, i18n)}</Text>
                  </Stack>
                  {action === null ? null : (
                    <ActionPill
                      tone={action.tone}
                      label={action.label}
                      onPress={action.onPress}
                      testID={`checklist-action-${step.kind}`}
                    />
                  )}
                </Row>
              </Card>
            );
          })}
        </Stack>
      </ScrollView>
      {showIt && phrase !== null ? (
        <ShowIt
          phrase={phrase.text}
          lang={phrase.language}
          gloss={phrase.gloss}
          onClose={() => setShowIt(false)}
        />
      ) : null}
      {askDesk && list.tripId !== null ? (
        <ConfirmSheet
          title={t({ id: 'safety.desk.title', message: 'Ops desk calls the clinic with you' })}
          consequences={[deskText]}
          confirmLabel={t({ id: 'safety.desk.confirm', message: 'Ask the desk' })}
          mode="button"
          onCancel={() => setAskDesk(false)}
          onConfirm={list.sendDesk}
          testID="checklist-desk-confirm"
        />
      ) : null}
    </Scaffold>
  );
}
