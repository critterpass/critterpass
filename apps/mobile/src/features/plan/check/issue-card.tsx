/**
 * One plan check card (7h-1): the kind's tag and the day's tag, the title, what is wrong, then
 * "→ what FIX does" with FIX. A too-far card opens in place to show the nearer place and its drive
 * before anything changes (undesigned: the short detail the design leaves to the card itself).
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { PlanningTag } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface IssueCardProps {
  readonly id: string;
  readonly tags: readonly { readonly label: string; readonly color: string }[];
  readonly title: string;
  readonly body: string;
  readonly summary: string | null;
  /** FIX for an organiser, SUGGEST for a member; null when there is nothing to do. */
  readonly fixLabel: string | null;
  readonly busy: boolean;
  readonly onFix: () => void;
  /** The too-far detail, open under the card. */
  readonly detail?: {
    readonly line: string;
    readonly useLabel: string;
    readonly onUse: (() => void) | null;
    /** "Keep it as it is": the card leaves the list. */
    readonly onKeep: () => void;
  } | null;
}

const useStyles = makeStyles((th) => ({
  card: {
    gap: th.space['8'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['6'] },
  foot: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  summary: { flex: 1, minWidth: 0 },
  detail: {
    gap: th.space['10'],
    paddingTop: th.space['10'],
    borderTopWidth: 1,
    borderTopColor: th.semantic.border.decorative,
  },
  detailActions: { flexDirection: 'row', alignItems: 'center', gap: th.space['16'] },
}));

export function IssueCard(props: IssueCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const detail = props.detail ?? null;
  return (
    <View style={styles.card} testID={`plan-check-issue-${props.id}`}>
      <View style={styles.tags}>
        {props.tags.map((tag) => (
          <PlanningTag key={tag.label} label={tag.label} color={tag.color} />
        ))}
      </View>
      <Text variant="title" singleLine={false}>
        {props.title}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary} singleLine={false}>
        {props.body}
      </Text>
      {props.summary === null && props.fixLabel === null ? null : (
        <View style={styles.foot}>
          <Text variant="bodySm" style={styles.summary} singleLine={false}>
            {props.summary === null ? '' : `→ ${props.summary}`}
          </Text>
          {props.fixLabel === null || detail !== null ? null : (
            <PillButton
              label={props.fixLabel}
              onPress={props.onFix}
              size="sm"
              loading={props.busy}
              testID={`plan-check-fix-${props.id}`}
            />
          )}
        </View>
      )}
      {detail === null ? null : (
        <View style={styles.detail} testID={`plan-check-detail-${props.id}`}>
          <Text variant="bodySm" singleLine={false}>
            {detail.line}
          </Text>
          <View style={styles.detailActions}>
            {detail.onUse === null ? null : (
              <PillButton
                label={detail.useLabel}
                onPress={detail.onUse}
                size="sm"
                loading={props.busy}
                testID={`plan-check-use-${props.id}`}
              />
            )}
            <TextLink
              label={t({ id: 'plan.check.keep', message: 'Keep it as it is' })}
              onPress={detail.onKeep}
              testID={`plan-check-keep-${props.id}`}
            />
          </View>
        </View>
      )}
    </View>
  );
}
