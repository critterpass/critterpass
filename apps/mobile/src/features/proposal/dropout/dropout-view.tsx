/**
 * {NAME}'S OUT (3f-7) as a pure view: "← WHO'S IN" and the orange chip, "{NAME} CAN'T MAKE IT",
 * their public reply line, WHAT {GUIDE} WOULD CHANGE with each old value struck, EVERYONE'S SHARE
 * with the new amount and the change each, "Keep {name} in the chat", and APPLY CHANGES. Nothing
 * moves until the organiser applies it.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Toggle } from '@/ui/inputs/Toggle';
import { Avatar } from '@/ui/people/Avatar';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { FooterFade, FOOTER_FADE_PT } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { ChangeRow } from './model';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: th.space['32'] + th.space['12'],
  },
  chip: {
    backgroundColor: th.color.orange,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['16'] + FOOTER_FADE_PT,
    gap: th.space['14'],
  },
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
  },
  reply: { flexDirection: 'row', gap: th.space['10'], alignItems: 'center' },
  grow: { flex: 1 },
  change: { gap: th.space['2'], paddingVertical: th.space['8'] },
  struck: { textDecorationLine: 'line-through' },
  share: {
    backgroundColor: th.semantic.action.primary,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
  },
  keep: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  footer: { paddingHorizontal: th.space['20'], paddingTop: th.space['8'] },
}));

export interface DropoutViewProps {
  readonly name: string;
  readonly joinIndex: number;
  readonly guideName: string;
  readonly replyLine: string;
  readonly rows: readonly ChangeRow[];
  readonly share: { readonly after: string; readonly before: string; readonly each: string } | null;
  readonly keepInChat: boolean;
  readonly resolved: boolean;
  readonly onBack: () => void;
  readonly onKeep: (keep: boolean) => void;
  readonly onApply: () => void;
}

export function DropoutView(props: DropoutViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const ink = theme.semantic.text.onAccent;
  const { name } = props;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-dropout">
      <View style={styles.header}>
        <BackEyebrow
          label={t({ id: 'proposal.dropout.back', message: 'Who’s in' })}
          onPress={props.onBack}
        />
        <View style={styles.chip}>
          <Text variant="label" color={ink}>
            {t({ id: 'proposal.dropout.chip', message: `${name} replied` })}
          </Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'proposal.dropout.title', message: `${name} can’t make it` })}
        </Text>
        <View style={[styles.card, styles.reply]}>
          <Avatar name={name} joinIndex={props.joinIndex} size="md" decorative />
          <Text variant="bodySm" color={theme.semantic.text.secondary} style={styles.grow}>
            {props.replyLine}
          </Text>
        </View>
        <View style={styles.card} testID="dropout-changes">
          <Text variant="eyebrow" color={theme.semantic.action.primary}>
            {t({ id: 'proposal.dropout.changes', message: `What ${props.guideName} would change` })}
          </Text>
          {props.rows.length === 0 ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {t({ id: 'proposal.dropout.noChanges', message: 'Nothing shared changes.' })}
            </Text>
          ) : (
            props.rows.map((row) => (
              <View key={row.key} style={styles.change}>
                <Text variant="rowTitle">{row.title.toUpperCase()}</Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {row.before === null ? null : (
                    <Text
                      variant="bodySm"
                      color={theme.semantic.text.tertiary}
                      style={styles.struck}
                    >
                      {row.before}
                    </Text>
                  )}
                  {row.before === null ? row.after : ` → ${row.after}`}
                </Text>
              </View>
            ))
          )}
        </View>
        {props.share === null ? null : (
          <View style={styles.share} testID="dropout-share">
            <View style={styles.grow}>
              <Text variant="eyebrow" color={ink}>
                {t({ id: 'proposal.dropout.share', message: 'Everyone’s share' })}
              </Text>
              <Text variant="h1" color={ink}>
                {props.share.after}{' '}
                <Text variant="bodySm" color={ink} style={styles.struck}>
                  {props.share.before}
                </Text>
              </Text>
            </View>
            <Text variant="label" color={ink}>
              {t({ id: 'proposal.dropout.each', message: `${props.share.each} each` })}
            </Text>
          </View>
        )}
        <View style={styles.keep}>
          <View style={styles.grow}>
            <Text variant="rowTitle">
              {t({ id: 'proposal.dropout.keep', message: `Keep ${name} in the chat` })}
            </Text>
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {t({
                id: 'proposal.dropout.keepSub',
                message: 'They’ll still get the photos and the recap',
              })}
            </Text>
          </View>
          <Toggle
            value={props.keepInChat}
            onValueChange={props.onKeep}
            label={t({ id: 'proposal.dropout.keep', message: `Keep ${name} in the chat` })}
            testID="dropout-keep"
          />
        </View>
      </ScrollView>
      <FooterFade />
      <View style={styles.footer}>
        {props.resolved ? (
          <Text variant="title" color={theme.semantic.state.success} testID="dropout-applied">
            {t({ id: 'proposal.dropout.applied', message: 'Applied. Shares are re-priced.' })}
          </Text>
        ) : (
          <PillButton
            label={t({ id: 'proposal.dropout.apply', message: 'Apply changes' })}
            onPress={props.onApply}
            sheen
            testID="dropout-apply"
          />
        )}
      </View>
    </Scaffold>
  );
}
