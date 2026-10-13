/**
 * The proposal builder in the premium look (the step before Who's in, 4.51): "Pitch it to the
 * crew", the three formats, the cost and personal-version toggles, reply-by, the truthful stay
 * rows (a booked stay's free cancellation from the member's own confirmation, never a hold we
 * placed), Preview as {name} per written version, and Send to {n} friends with the reason when it
 * can't. Undesigned in the premium set; built from the kit (docs/undesigned-states.md). Reads and
 * commands are the shared `BuilderScreen`'s.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  ListCard,
  OfflinePill,
  Row,
  Text,
  TextButton,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { BuilderViewProps } from '../builder/views';
import { FormatTiles } from './format-tiles';

export function PremiumBuilderView(props: BuilderViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const { config, guideName } = props;
  const n = props.recipients;
  const showCost = t({ id: 'proposal.build.showCost', message: 'Show cost per person' });
  const personal = t({ id: 'proposal.build.personal', message: 'Personal versions' });
  return (
    <PushScreen
      title={t({ id: 'proposal.build.title', message: 'Pitch it to the crew' })}
      subtitle={t({ id: 'proposal.build.ready', message: 'Ready to send' })}
      backLabel={t({ id: 'proposal.build.back', message: `${props.destination} plan` })}
      scroll={false}
      testID="proposal-build"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: th.space.gutter,
          paddingTop: th.space.gap12,
          paddingBottom: th.space.gap16,
          gap: th.space.gap16,
        }}
      >
        <Text variant="body" tone="muted" testID="build-title">
          {config.personal
            ? t({
                id: 'proposal.build.sub',
                message: `${guideName} wrote a version for each person. Pick how it arrives.`,
              })
            : t({
                id: 'proposal.build.subShared',
                message: `${guideName} wrote one version for everyone. Pick how it arrives.`,
              })}
        </Text>
        {props.offline ? <OfflinePill /> : null}
        <FormatTiles
          value={config.format}
          onChange={props.onFormat}
          guide={props.guide}
          destination={props.destination}
          headline={props.headline}
          price={config.showCost ? props.price : null}
        />
        <ListCard testID="build-settings">
          <Row
            title={showCost}
            {...(props.price === null ? {} : { subtitle: props.price })}
            trailing={
              <Toggle
                value={config.showCost}
                onChange={props.onShowCost}
                accessibilityLabel={showCost}
                testID="build-show-cost"
              />
            }
          />
          <Row
            title={personal}
            subtitle={
              config.personal
                ? n === 1
                  ? t({
                      id: 'proposal.build.personalOne',
                      message: `One for your friend, written by ${guideName}`,
                    })
                  : t({
                      id: 'proposal.build.personalOn',
                      message: `One for each of the ${n}, written by ${guideName}`,
                    })
                : t({ id: 'proposal.build.personalOff', message: 'One version for the whole crew' })
            }
            trailing={
              <Toggle
                value={config.personal}
                onChange={props.onPersonal}
                accessibilityLabel={personal}
                testID="build-personal"
              />
            }
          />
          <Row
            title={t({ id: 'proposal.build.replyBy', message: 'Reply by' })}
            trailingText={props.replyByLabel}
            onPress={props.onReplyBy}
            testID="build-reply-by"
          />
        </ListCard>
        <ListCard testID="build-stays">
          {props.stays.length === 0 ? (
            <Row
              title={t({ id: 'proposal.build.noStay', message: 'Stays not booked yet' })}
              subtitle={t({
                id: 'proposal.build.noStaySub',
                message: 'Book once the crew agrees. Nothing is held for you.',
              })}
            />
          ) : (
            props.stays.map((stay) => (
              <Row
                key={stay.key}
                title={stay.title}
                subtitle={
                  stay.freeCancelUntil === null
                    ? t({
                        id: 'proposal.build.stayNoCancel',
                        message: 'Booked · no free cancellation',
                      })
                    : t({
                        id: 'proposal.build.stayCancel',
                        message: `Free cancellation until ${stay.freeCancelUntil}`,
                      })
                }
              />
            ))
          )}
        </ListCard>
        {props.previews.length === 0 ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap8 }}>
            {props.previews.map((p) => (
              <Button
                key={p.uid}
                label={t({ id: 'proposal.build.previewAs', message: `Preview as ${p.name}` })}
                variant="control"
                size="small"
                onPress={() => props.onPreview(p.uid)}
                testID={`build-preview-${p.uid}`}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: th.space.titleGutter,
          paddingTop: th.space.gap8,
          paddingBottom: insets.bottom + th.space.gap12,
          gap: th.space.gap8,
        }}
      >
        {props.issues == null ? null : (
          <View testID="build-issues" style={{ gap: th.space.gap4 }}>
            <Text variant="caption" color={th.color.status.tangerine.text} align="center">
              {props.issues.line}
            </Text>
            {props.issues.onOpen === undefined ? null : (
              <TextButton
                label={t({ id: 'proposal.issues.open', message: 'Open the plan check' })}
                onPress={props.issues.onOpen}
                tone="ink"
                align="center"
                testID="build-issues-open"
              />
            )}
          </View>
        )}
        {props.blocked === null ? null : (
          <Text variant="caption" tone="muted" align="center" testID="build-blocked">
            {props.blocked}
          </Text>
        )}
        <Button
          label={
            n === 1
              ? t({ id: 'proposal.build.sendOne', message: 'Send to 1 friend' })
              : t({ id: 'proposal.build.send', message: `Send to ${n} friends` })
          }
          onPress={props.onSend}
          disabled={props.blocked !== null}
          loading={props.sending}
          testID="build-send"
        />
      </View>
    </PushScreen>
  );
}
