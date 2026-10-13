/**
 * The plan check in the premium look (4.43), reached from the plan map's check line and the ⋯:
 * each problem as the fix panel the design opens under a day (its tags, what's wrong, the one-line
 * fix, and Fix it or Suggest, another way, Leave it), what to know, balancing the crew, and Fix
 * all. The ask card and every action come from the shared `CheckScreen`.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Icon,
  ListCard,
  LoadingCritter,
  PressableScale,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';
import { useLocale } from '@/lib/i18n/use-locale';

import type { CheckViewProps } from '../../check/check-props';
import { barTitle } from './bar-title';

export function PremiumCheckView(props: CheckViewProps) {
  const locale = useLocale();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const pink = theme.color.banner.error;
  return (
    <PushScreen
      title={barTitle(props.title, locale)}
      subtitle={barTitle(props.status, locale)}
      backLabel={props.backLabel}
      scroll={false}
      testID="plan-check"
    >
      <ScrollView contentContainerStyle={{ padding: theme.space.gap16, gap: theme.space.gap12 }}>
        <Text variant="body" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
          {props.body}
        </Text>
        {props.ask}
        {props.state === 'loading' ? <LoadingCritter label={props.status} /> : null}
        {props.notice === null ? null : (
          <Text variant="body" testID="plan-check-notice">
            {props.notice}
          </Text>
        )}
        {props.cards.map((card) => (
          <View
            key={card.id}
            testID={`plan-check-card-${card.id}`}
            style={{
              borderRadius: 18,
              backgroundColor: pink.bg,
              padding: theme.space.gap12,
              gap: theme.space.gap8,
            }}
          >
            {card.tags.length === 0 ? null : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
                {card.tags.map((tag) => (
                  <View
                    key={tag.label}
                    style={{
                      height: 22,
                      borderRadius: 11,
                      paddingHorizontal: theme.space.gap8,
                      justifyContent: 'center',
                      backgroundColor: theme.color.card,
                    }}
                  >
                    <Text variant="badge" color={tag.color}>
                      {tag.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <Text variant="rowTitle" color={pink.text}>
              {card.title}
            </Text>
            <Text variant="caption" color={pink.text}>
              {card.body}
            </Text>
            {card.summary === null ? null : (
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: theme.color.card,
                  paddingVertical: theme.space.gap8,
                  paddingHorizontal: theme.space.gap10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap8,
                }}
              >
                <Icon name="check" size={16} color={theme.color.toggleOn} />
                <Text variant="rowTextStrong" style={{ flex: 1 }}>
                  {card.summary}
                </Text>
              </View>
            )}
            {card.detail == null ? null : (
              <Text variant="captionMuted" color={pink.text}>
                {card.detail.line}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
              {card.fixLabel === null ? null : (
                <Button
                  size="small"
                  label={card.fixLabel}
                  onPress={card.onFix}
                  loading={card.busy}
                  testID={`plan-check-fix-${card.id}`}
                />
              )}
              {card.detail?.onUse == null ? null : (
                <Button
                  size="small"
                  variant="control"
                  label={card.detail.useLabel}
                  onPress={card.detail.onUse}
                />
              )}
              {card.detail == null ? null : (
                <Button
                  size="small"
                  variant="control"
                  label={t({ id: 'plan.premium.check.leave', message: 'Leave it' })}
                  onPress={card.detail.onKeep}
                />
              )}
            </View>
          </View>
        ))}
        {props.know.length === 0 ? null : (
          <View style={{ gap: theme.space.gap8 }}>
            <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap8 }}>
              {t({ id: 'plan.check.toKnow', message: 'To know' })}
            </Text>
            <ListCard>
              {props.know.map((line) => (
                <Text key={line} variant="rowText" style={{ padding: theme.space.rowPadH }}>
                  {line}
                </Text>
              ))}
            </ListCard>
          </View>
        )}
        {props.balance === null ? null : (
          <ListCard>
            <PressableScale
              onPress={props.balance.onPress}
              accessibilityRole="button"
              testID="plan-check-balance"
              style={{ flexDirection: 'row', alignItems: 'center', padding: theme.space.rowPadH }}
            >
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {props.balance.label}
              </Text>
              <Icon name="forward" size={16} color={theme.color.placeholder} />
            </PressableScale>
          </ListCard>
        )}
      </ScrollView>
      {props.fixAll === null ? null : (
        <View
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingBottom: insets.bottom + theme.space.gap12,
          }}
        >
          <Button
            label={props.fixAll.label}
            onPress={props.fixAll.onPress}
            loading={props.fixAll.busy}
            testID="plan-check-fix-all"
          />
        </View>
      )}
    </PushScreen>
  );
}
