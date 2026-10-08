/**
 * Rate your driver (6g-1): the driver's card (name, days, car), LOVED IT / FINE / NOT AGAIN, the
 * tags, one tip for the next crew, and INVITE {NAME} TO BE LISTED. Only the crew's combined answer
 * reaches his listing; nothing about the member does.
 */
import { upper } from '@cp/i18n';
import { DRIVER_TAGS, DRIVER_VERDICTS, type DriverTag, type DriverVerdict } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Icon } from '@/ui/icons/Icon';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { TAG_LABELS, VERDICT_LABELS } from './labels';

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.cardBig,
    padding: 16,
    gap: 6,
  },
  verdict: {
    flex: 1,
    minHeight: 72,
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  days: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
}));

const VERDICT_ICON = { loved: 'heart', fine: 'check', not_again: 'circle' } as const;

export interface RateDriverViewProps {
  readonly name: string;
  readonly days: readonly number[];
  readonly detail: string | null;
  readonly verdict: DriverVerdict | null;
  readonly tags: readonly DriverTag[];
  readonly tip: string;
  readonly saving: boolean;
  readonly saved: boolean;
  readonly onBack: () => void;
  readonly onVerdict: (verdict: DriverVerdict) => void;
  readonly onToggleTag: (tag: DriverTag) => void;
  readonly onTip: (tip: string) => void;
  readonly onSave: () => void;
  readonly onInvite: (() => void) | null;
}

export function RateDriverView(props: RateDriverViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t, i18n } = useLingui();
  const name = props.name;
  const days = props.days
    .map((day) => t({ id: 'drivers.rate.day', message: `Day ${day}` }))
    .join(' + ');
  return (
    <Scaffold testID="drivers-rate">
      <ScrollView
        contentContainerStyle={{
          padding: theme.space['20'],
          gap: theme.space['16'],
          paddingBottom: theme.space['32'] + theme.space['16'],
        }}
      >
        <BackEyebrow
          label={t({ id: 'drivers.rate.back', message: 'Our drivers' })}
          onPress={props.onBack}
        />
        <Text variant="displayXl">
          {upper(t({ id: 'drivers.rate.title', message: 'Rate your driver' }), locale)}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {t({
            id: 'drivers.rate.intro',
            message: `Your crew's rating and tags go on ${name}'s listing if he's listed. Nothing about you does.`,
          })}
        </Text>
        <Stack style={styles.card}>
          <Row gap="8" align="center" style={{ justifyContent: 'space-between' }}>
            <Text variant="h2">{upper(name, locale)}</Text>
            {days === '' ? null : (
              <View style={styles.days}>
                <Text variant="label">{upper(days, locale)}</Text>
              </View>
            )}
          </Row>
          {props.detail === null ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {props.detail}
            </Text>
          )}
        </Stack>
        <Row gap="8">
          {DRIVER_VERDICTS.map((verdict) => {
            const selected = props.verdict === verdict;
            return (
              <Pressable
                key={verdict}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => props.onVerdict(verdict)}
                style={[styles.verdict, selected ? { borderColor: theme.color.pink } : null]}
                testID={`drivers-verdict-${verdict}`}
              >
                <Icon
                  name={VERDICT_ICON[verdict]}
                  size={24}
                  {...(verdict === 'loved' ? { color: theme.color.pink } : {})}
                  decorative
                />
                <Text variant="label">{upper(i18n._(VERDICT_LABELS[verdict]), locale)}</Text>
              </Pressable>
            );
          })}
        </Row>
        <Row gap="6" style={{ flexWrap: 'wrap' }}>
          {DRIVER_TAGS.map((tag) => (
            <ChoiceChip
              key={tag}
              label={upper(i18n._(TAG_LABELS[tag]), locale)}
              selected={props.tags.includes(tag)}
              onPress={() => props.onToggleTag(tag)}
              testID={`drivers-tag-${tag}`}
            />
          ))}
        </Row>
        <TextField
          label={t({ id: 'drivers.rate.tip', message: 'One tip for the next crew' })}
          value={props.tip}
          onChangeText={props.onTip}
          maxLength={280}
          maxLines={4}
          testID="drivers-rate-tip"
        />
        <PillButton
          label={
            props.saved
              ? t({ id: 'drivers.rate.saved', message: 'Answer saved' })
              : t({ id: 'drivers.rate.save', message: 'Save our answer' })
          }
          onPress={props.onSave}
          loading={props.saving}
          disabled={props.verdict === null || props.saved}
          testID="drivers-rate-save"
        />
        {props.onInvite === null ? null : (
          <PillButton
            variant="secondary"
            label={t({ id: 'drivers.rate.invite', message: `Invite ${name} to be listed` })}
            onPress={props.onInvite}
            testID="drivers-rate-invite"
          />
        )}
      </ScrollView>
    </Scaffold>
  );
}
