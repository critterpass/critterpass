/**
 * A member's dropout in the premium look (undesigned; a push page drawn like Who's in): "{name}
 * can't make it" with their public reply, what the guide would change with each old value struck,
 * everyone's new share with the change each, "Keep {name} in the chat", and Apply changes.
 * Nothing moves until the organiser applies it.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { crewColour } from '@/features/vote';
import { Button, Card, CrewStack, ListCard, Text, Toggle, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import type { DropoutViewProps } from '../dropout/dropout-screen';

export function PremiumDropoutView(props: DropoutViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { name } = props;
  const keepLabel = t({ id: 'proposal.dropout.keep', message: `Keep ${name} in the chat` });
  const hairline = {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.hairline,
  };
  return (
    <PushScreen
      title={t({ id: 'proposal.dropout.title', message: `${name} can’t make it` })}
      subtitle={t({ id: 'proposal.dropout.chip', message: `${name} replied` })}
      backLabel={t({ id: 'proposal.dropout.back', message: 'Who’s in' })}
      scroll={false}
      testID="proposal-dropout"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}
      >
        <Card>
          <View style={styles.reply}>
            <CrewStack
              members={[{ id: name, name, color: crewColour(props.joinIndex) }]}
              size={32}
              accessibilityLabel={name}
            />
            <Text variant="rowText" tone="muted" style={styles.grow}>
              {props.replyLine}
            </Text>
          </View>
        </Card>
        <Text variant="captionMuted" tone="muted" style={styles.section}>
          {t({ id: 'proposal.dropout.changes', message: `What ${props.guideName} would change` })}
        </Text>
        <ListCard testID="dropout-changes">
          {props.rows.length === 0 ? (
            <View style={[styles.change, { paddingHorizontal: theme.space.rowPadH }]}>
              <Text variant="rowText" tone="muted">
                {t({ id: 'proposal.dropout.noChanges', message: 'Nothing shared changes.' })}
              </Text>
            </View>
          ) : (
            props.rows.map((row, index) => (
              <View
                key={row.key}
                style={[
                  styles.change,
                  { paddingHorizontal: theme.space.rowPadH },
                  index > 0 && hairline,
                ]}
              >
                <Text variant="rowTextStrong">{row.title}</Text>
                <Text variant="captionMuted" tone="muted">
                  {row.before === null ? null : (
                    <Text variant="captionMuted" tone="placeholder" style={styles.struck}>
                      {row.before}
                    </Text>
                  )}
                  {row.before === null ? row.after : ` → ${row.after}`}
                </Text>
              </View>
            ))
          )}
        </ListCard>
        {props.share === null ? null : (
          <Card testID="dropout-share">
            <View style={styles.reply}>
              <View style={styles.grow}>
                <Text variant="captionMuted" tone="muted">
                  {t({ id: 'proposal.dropout.share', message: 'Everyone’s share' })}
                </Text>
                <View style={styles.amounts}>
                  <Text variant="stat">{props.share.after}</Text>
                  <Text variant="rowText" tone="placeholder" style={styles.struck}>
                    {props.share.before}
                  </Text>
                </View>
              </View>
              <Text variant="rowTextStrong">
                {t({ id: 'proposal.dropout.each', message: `${props.share.each} each` })}
              </Text>
            </View>
          </Card>
        )}
        <ListCard>
          <View style={[styles.keep, { paddingHorizontal: theme.space.rowPadH }]}>
            <View style={styles.grow}>
              <Text variant="rowTextStrong">{keepLabel}</Text>
              <Text variant="captionMuted" tone="muted">
                {t({
                  id: 'proposal.dropout.keepSub',
                  message: 'They’ll still get the photos and the recap',
                })}
              </Text>
            </View>
            <Toggle
              value={props.keepInChat}
              onChange={props.onKeep}
              accessibilityLabel={keepLabel}
              testID="dropout-keep"
            />
          </View>
        </ListCard>
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: insets.bottom + theme.space.gap12,
          },
        ]}
      >
        {props.resolved ? (
          <Text variant="headline" align="center" testID="dropout-applied">
            {t({ id: 'proposal.dropout.applied', message: 'Applied. Shares are re-priced.' })}
          </Text>
        ) : (
          <>
            <Button
              label={t({ id: 'proposal.dropout.apply', message: 'Apply changes' })}
              onPress={props.onApply}
              loading={props.applying}
              testID="dropout-apply"
            />
            {props.applying && props.offline ? (
              <Text variant="caption" tone="muted" align="center" testID="dropout-applying">
                {t({
                  id: 'proposal.dropout.applyingOffline',
                  message: 'Saved. It applies when you’re back online.',
                })}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  reply: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  section: { paddingHorizontal: 4, marginTop: 4 },
  change: { gap: 2, paddingVertical: 11 },
  struck: { textDecorationLine: 'line-through' },
  amounts: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  keep: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  footer: { gap: 6, paddingTop: 8 },
});
