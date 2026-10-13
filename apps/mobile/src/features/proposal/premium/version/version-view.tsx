/**
 * A member's own version of the proposal in the premium look (undesigned; a push page drawn like
 * Who's in): the reply-by or answer chip under the title, the trip line, "{name}, here's your
 * version" with the guide's line, the picks, the whole plan, the share and the crew's hype, and
 * the three answers (I'm in, Maybe, I can't make it) with "Not sure? Ask {guide}" under them.
 * Once answered it says so in place of the buttons, with the way to change it. The organiser's
 * preview is read-only; a version still being written says so.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { guideSticker } from '@/ui/premium/stickers/guides';
import { Button, Card, LoadingCritter, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { YourVersionViewProps } from '../../your-version/version-model';
import { PremiumPicksList } from './picks';
import { versionAnsweredLine, versionSubLine, versionTitle } from './version-copy';

export function PremiumYourVersionView(props: YourVersionViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const info = guideSticker(props.guide);
  const answer = props.answer;
  return (
    <PushScreen
      title={t({ id: 'proposal.version.back', message: 'Proposal' })}
      {...(props.chip === null ? {} : { subtitle: props.chip })}
      backLabel={t({ id: 'proposal.loadingBack', message: 'Back' })}
      scroll={false}
      testID="proposal-version"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: theme.space.gutter, gap: theme.space.gap14 }}
      >
        <View style={styles.head}>
          {props.tripLine === '' ? null : (
            <Text variant="captionMuted" tone="muted" testID="version-trip">
              {props.tripLine}
            </Text>
          )}
          <Text variant="largeTitle" accessibilityRole="header" testID="version-title">
            {versionTitle(props)}
          </Text>
          <Text variant="body" tone="muted">
            {versionSubLine(props, info)}
          </Text>
        </View>
        {props.fallbackNote === null ? null : (
          <Card>
            <Text variant="rowText" tone="muted">
              {props.fallbackNote}
            </Text>
          </Card>
        )}
        {props.pending ? (
          <View testID="version-pending">
            <LoadingCritter
              critter={{ kind: info.kind, name: info.name }}
              label={t({
                id: 'proposal.version.pending',
                message: `${info.name} is still writing this version. It lands here in a moment.`,
              })}
            />
          </View>
        ) : (
          <PremiumPicksList
            picks={props.picks}
            when={props.when}
            tag={props.tag}
            onOpen={props.onPick}
          />
        )}
        {props.onPlan === undefined || props.pending ? null : (
          <TextButton
            label={t({ id: 'proposal.version.wholePlan', message: 'See the whole plan' })}
            onPress={props.onPlan}
            testID="version-whole-plan"
          />
        )}
        {props.share}
        {props.hype}
      </ScrollView>
      {props.preview ? null : (
        <View
          style={[
            styles.footer,
            {
              paddingHorizontal: theme.space.titleGutter,
              paddingBottom: insets.bottom + theme.space.gap12,
            },
          ]}
        >
          {answer === null || answer === 'maybe' ? (
            <>
              {answer === 'maybe' ? (
                <Text variant="caption" tone="muted" align="center" testID="version-maybe-said">
                  {t({
                    id: 'proposal.version.saidMaybe',
                    message: 'You said maybe. Say yes or no when you know.',
                  })}
                </Text>
              ) : null}
              <Button
                label={t({ id: 'proposal.version.in', message: 'I’m in' })}
                onPress={props.onIn}
                testID="version-in"
              />
              <View style={styles.row}>
                {answer === 'maybe' ? null : (
                  <View style={styles.grow}>
                    <Button
                      variant="secondary"
                      size="medium"
                      label={t({ id: 'proposal.version.maybe', message: 'Maybe' })}
                      onPress={props.onMaybe}
                      testID="version-maybe"
                    />
                  </View>
                )}
                <View style={styles.grow}>
                  <Button
                    variant="secondary"
                    size="medium"
                    label={t({ id: 'proposal.version.cant', message: 'I can’t make it' })}
                    onPress={props.onOut}
                    testID="version-cant"
                  />
                </View>
              </View>
              <TextButton
                align="center"
                label={t({
                  id: 'proposal.version.askFirst',
                  message: `Not sure? Ask ${info.name}`,
                })}
                onPress={props.onAsk}
                testID="version-ask"
              />
            </>
          ) : (
            <>
              <Text variant="headline" align="center" testID="version-answered">
                {versionAnsweredLine(answer)}
              </Text>
              {answer === 'in' ? (
                <TextButton
                  align="center"
                  tone="muted"
                  label={t({
                    id: 'proposal.version.out.cta',
                    message: 'I can’t make it after all',
                  })}
                  onPress={props.onOut}
                  testID="version-out"
                />
              ) : answer === 'out' ? (
                <TextButton
                  align="center"
                  label={t({ id: 'proposal.version.inAfterAll', message: 'I’m in after all' })}
                  onPress={props.onIn}
                  testID="version-in-after-all"
                />
              ) : null}
            </>
          )}
        </View>
      )}
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  footer: { gap: 10, paddingTop: 8 },
  row: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
});
